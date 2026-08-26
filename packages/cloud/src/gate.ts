import type { CloudContext, CloudDeps, CloudMiddleware, PayProtocol, ReceiptRow } from "./types.ts";

const USDC_DECIMALS = 1_000_000;
const DEFAULT_PRICE_USD = 0.05;
const MINUTE_MS = 60_000;

export function gatePriceUsd(deps: CloudDeps): number {
  const raw = deps.env.ZAP_GATE_PRICE_USD;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PRICE_USD;
}

export function paymentRequiredHeader(deps: CloudDeps, resource: string): string {
  const challenge = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: deps.env.ZAP_X402_NETWORK ?? "eip155:8453",
        maxAmountRequired: String(Math.ceil(gatePriceUsd(deps) * USDC_DECIMALS)),
        payTo: deps.treasury,
        asset: deps.env.ZAP_X402_ASSET ?? "usdc",
        resource,
      },
    ],
  };
  return Buffer.from(JSON.stringify(challenge), "utf8").toString("base64");
}

function payPageHtml(deps: CloudDeps, resource: string): string {
  return [
    "<!doctype html>",
    "<html><head><title>Zap — payment required</title></head><body>",
    "<h1>Payment required</h1>",
    `<p>This Zap endpoint costs $${gatePriceUsd(deps)} per request.</p>`,
    `<p>Resource: ${resource}</p>`,
    "<p>Pay with an x402 v2 wallet (PAYMENT-SIGNATURE) or MPP (Authorization: Payment), or run <code>zap pay login --managed</code>.</p>",
    "</body></html>",
  ].join("\n");
}

interface Credential {
  protocol: PayProtocol;
  payload: string;
}

function readCredential(c: CloudContext, deps: CloudDeps): Credential | { error: string } | null {
  const v2 = c.req.header("PAYMENT-SIGNATURE");
  if (v2) return { protocol: "x402", payload: v2 };
  const auth = c.req.header("authorization");
  if (auth?.startsWith("Payment ")) return { protocol: "mpp", payload: auth.slice("Payment ".length) };
  const v1 = c.req.header("X-PAYMENT");
  if (v1) {
    if (deps.env.ZAP_X402_V1_SHIM === "1") return { protocol: "x402-v1", payload: v1 };
    return {
      error:
        "x402 v1 X-PAYMENT is not accepted. Upgrade to x402 v2 and send PAYMENT-SIGNATURE (set ZAP_X402_V1_SHIM=1 for temporary compatibility).",
    };
  }
  return null;
}

async function reject(
  c: CloudContext,
  deps: CloudDeps,
  message: string,
  opts?: { challenge?: boolean },
): Promise<Response> {
  await deps.counters.bump("gateRejections");
  const resource = new URL(c.req.url).pathname;
  if (opts?.challenge !== false) {
    c.header("PAYMENT-REQUIRED", paymentRequiredHeader(deps, resource));
    c.header("WWW-Authenticate", 'Payment realm="zap"');
  }
  if (c.req.header("accept")?.includes("text/html")) {
    c.status(402);
    c.header("content-type", "text/html; charset=utf-8");
    return c.body(payPageHtml(deps, resource));
  }
  return c.json({ error: { code: "PAYMENT_REQUIRED", message } }, 402);
}

/**
 * The pay gate: x402 v2 (PAYMENT-SIGNATURE) and MPP (Authorization: Payment)
 * settle through the facilitator with `SET NX` replay protection; receipts
 * are written before any meter reservation. `payTo` is always the treasury.
 */
export function createGate(deps: CloudDeps): CloudMiddleware {
  return async (c, next) => {
    const resource = new URL(c.req.url).pathname;
    const credential = readCredential(c as CloudContext, deps);
    if (credential === null) {
      return reject(c as CloudContext, deps, `Payment required for ${resource}.`);
    }
    if ("error" in credential) {
      return reject(c as CloudContext, deps, credential.error, { challenge: false });
    }

    const principal = c.get("principal") ?? "anonymous";
    const gateLimit = deps.limits?.gatePerMinute;
    if (gateLimit !== undefined) {
      const allowed = await deps.limiter.hit(`gate:${principal}`, gateLimit, MINUTE_MS);
      if (!allowed) {
        await deps.counters.bump("gateRejections");
        return c.json({ error: { code: "RATE_LIMITED", message: "Too many payments; retry later." } }, 429);
      }
    }

    let verified;
    try {
      verified = await deps.facilitator.verify(credential.payload, { payTo: deps.treasury });
    } catch {
      return reject(c as CloudContext, deps, "Payment verification failed.");
    }
    if (verified.amountUsd + 1e-9 < gatePriceUsd(deps)) {
      return reject(
        c as CloudContext,
        deps,
        `Underpayment: $${verified.amountUsd} is below the $${gatePriceUsd(deps)} price.`,
      );
    }
    const nonceKey = `zap:gate:nonce:${verified.nonce}`;
    const fresh = await deps.nonces.setNX(nonceKey);
    if (!fresh) {
      return reject(c as CloudContext, deps, "This payment was already redeemed.");
    }

    let settled;
    try {
      settled = await deps.facilitator.settle(credential.payload);
    } catch {
      await deps.nonces.del(nonceKey);
      return reject(c as CloudContext, deps, "Payment settlement failed.");
    }

    const now = (deps.now ?? (() => new Date()))();
    const receipt: ReceiptRow = {
      id: `rcpt_${verified.nonce}`,
      protocol: credential.protocol,
      nonce: verified.nonce,
      payer: verified.payer,
      payTo: deps.treasury,
      amountUsd: verified.amountUsd,
      txHash: settled.txHash,
      at: now.toISOString(),
    };
    await deps.receipts.insert(receipt);
    await deps.meter.reserve(`wallet:${verified.payer}`, receipt.id, verified.amountUsd);
    c.set("receipt", receipt);

    const receiptHeader = Buffer.from(
      JSON.stringify({ receiptId: receipt.id, txHash: settled.txHash }),
      "utf8",
    ).toString("base64");
    if (credential.protocol === "mpp") c.header("Payment-Receipt", receiptHeader);
    else c.header("PAYMENT-RESPONSE", receiptHeader);

    await next();
  };
}
