import type { Facilitator, VerifiedPayment } from "../types.ts";

const USDC_DECIMALS = 1_000_000;

export interface CdpFacilitatorOptions {
  /** Coinbase CDP x402 facilitator base URL. */
  baseUrl?: string;
  /** bearer token minted from the CDP API key; sent as a header only, never logged. */
  authToken: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.cdp.coinbase.com/platform/v2/x402";

interface VerifyResponse {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

interface SettleResponse {
  success: boolean;
  transaction?: string;
  errorReason?: string;
}

function decodePayload(payload: string): { nonce: string; amountUsd: number } {
  const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
    payload?: { authorization?: { nonce?: string; value?: string } };
  };
  const authorization = parsed.payload?.authorization;
  return {
    nonce: authorization?.nonce ?? "",
    amountUsd: Number(authorization?.value ?? "0") / USDC_DECIMALS,
  };
}

/** Coinbase CDP x402 facilitator: the alternate to thirdweb, same contract. */
export function cdpFacilitator(options: CdpFacilitatorOptions): Facilitator {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const call = async (path: "verify" | "settle", payload: string): Promise<Response> =>
    fetchImpl(`${baseUrl}/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.authToken}`,
      },
      body: JSON.stringify({ paymentPayload: JSON.parse(Buffer.from(payload, "base64").toString("utf8")) }),
    });

  return {
    async verify(payload): Promise<VerifiedPayment> {
      const res = await call("verify", payload);
      if (!res.ok) throw new Error(`Facilitator verify failed (${res.status}).`);
      const body = (await res.json()) as VerifyResponse;
      if (!body.isValid) throw new Error(body.invalidReason ?? "Payment invalid.");
      const decoded = decodePayload(payload);
      return { payer: body.payer ?? "", amountUsd: decoded.amountUsd, nonce: decoded.nonce };
    },
    async settle(payload) {
      const res = await call("settle", payload);
      if (!res.ok) throw new Error(`Facilitator settle failed (${res.status}).`);
      const body = (await res.json()) as SettleResponse;
      if (!body.success) throw new Error(body.errorReason ?? "Settlement failed.");
      return { txHash: body.transaction ?? "" };
    },
  };
}
