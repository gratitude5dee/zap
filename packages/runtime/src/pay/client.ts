import { PayError } from "./errors.ts";

export interface PaymentRequirement {
  scheme: string;
  network: string;
  /** atomic units of the asset (USDC: 6 decimals). */
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  resource: string;
}

export interface PaymentRequired {
  x402Version: number;
  accepts: PaymentRequirement[];
}

export interface PaymentSigner {
  address: string;
  /** sign one accepted requirement; returns the PAYMENT-SIGNATURE header value. */
  signPayment(accept: PaymentRequirement): Promise<string>;
}

export interface WrapFetchOptions {
  /** hard client-side spend cap per request in USD. */
  maxValueUsd: number;
}

const USDC_DECIMALS = 1_000_000;

function decodeRequired(header: string): PaymentRequired {
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as PaymentRequired;
  } catch {
    throw new PayError("PAYMENT_MALFORMED", "Unreadable PAYMENT-REQUIRED challenge.");
  }
}

/**
 * Wrap fetch with x402 v2 payment: on 402, read the challenge, refuse any
 * amount above the session-key cap, sign, and retry with PAYMENT-SIGNATURE.
 */
export function wrapFetchWithPayment(
  fetchImpl: typeof fetch,
  signer: PaymentSigner,
  options: WrapFetchOptions,
): typeof fetch {
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const first = await fetchImpl(input, init);
    if (first.status !== 402) return first;
    const header = first.headers.get("PAYMENT-REQUIRED");
    if (!header) return first;
    const required = decodeRequired(header);
    const accept = required.accepts[0];
    if (!accept) {
      throw new PayError("PAYMENT_MALFORMED", "The 402 challenge lists no accepted payment.");
    }
    const amountUsd = Number(accept.maxAmountRequired) / USDC_DECIMALS;
    if (!Number.isFinite(amountUsd) || amountUsd < 0) {
      throw new PayError("PAYMENT_MALFORMED", "The 402 challenge amount is unreadable.");
    }
    if (amountUsd > options.maxValueUsd) {
      throw new PayError(
        "PAYMENT_ABOVE_CAP",
        `Refusing a $${amountUsd} payment above the $${options.maxValueUsd} session cap.`,
        "Re-run zap pay login --managed with a higher --max-value if intended.",
      );
    }
    const signature = await signer.signPayment(accept);
    const headers = new Headers(init?.headers);
    headers.set("PAYMENT-SIGNATURE", signature);
    return fetchImpl(input, { ...init, headers });
  };
  return wrapped as typeof fetch;
}
