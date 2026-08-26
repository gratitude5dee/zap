import type { Facilitator, VerifiedPayment } from "../types.ts";

const USDC_DECIMALS = 1_000_000;

export interface ThirdwebFacilitatorOptions {
  /** thirdweb x402 facilitator base URL. */
  baseUrl?: string;
  /** thirdweb secret key; sent as a header only, never logged. */
  secretKey: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.thirdweb.com/v1/payments/x402";

interface FacilitatorVerifyResponse {
  isValid: boolean;
  payer?: string;
  invalidReason?: string;
}

interface FacilitatorSettleResponse {
  success: boolean;
  transaction?: string;
  errorReason?: string;
}

function decodePayload(payload: string): { nonce: string; amountUsd: number; raw: unknown } {
  const parsed = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
    payload?: { authorization?: { nonce?: string; value?: string } };
  };
  const authorization = parsed.payload?.authorization;
  return {
    nonce: authorization?.nonce ?? "",
    amountUsd: Number(authorization?.value ?? "0") / USDC_DECIMALS,
    raw: parsed,
  };
}

/**
 * Thirdweb x402 facilitator (the default): verifies and settles x402 v2
 * payment payloads server-side. No custody — settlement moves funds from the
 * payer's wallet to `payTo` (the treasury) on-chain.
 */
export function thirdwebFacilitator(options: ThirdwebFacilitatorOptions): Facilitator {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const call = async (path: "verify" | "settle", payload: string): Promise<Response> =>
    fetchImpl(`${baseUrl}/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-secret-key": options.secretKey,
      },
      body: JSON.stringify({ paymentPayload: JSON.parse(Buffer.from(payload, "base64").toString("utf8")) }),
    });

  return {
    async verify(payload): Promise<VerifiedPayment> {
      const res = await call("verify", payload);
      if (!res.ok) throw new Error(`Facilitator verify failed (${res.status}).`);
      const body = (await res.json()) as FacilitatorVerifyResponse;
      if (!body.isValid) throw new Error(body.invalidReason ?? "Payment invalid.");
      const decoded = decodePayload(payload);
      return { payer: body.payer ?? "", amountUsd: decoded.amountUsd, nonce: decoded.nonce };
    },
    async settle(payload) {
      const res = await call("settle", payload);
      if (!res.ok) throw new Error(`Facilitator settle failed (${res.status}).`);
      const body = (await res.json()) as FacilitatorSettleResponse;
      if (!body.success) throw new Error(body.errorReason ?? "Settlement failed.");
      return { txHash: body.transaction ?? "" };
    },
  };
}
