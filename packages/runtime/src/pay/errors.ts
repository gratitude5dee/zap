export type PayErrorCode =
  | "PAYER_MISSING"
  | "PAYMENT_ABOVE_CAP"
  | "PAYMENT_REJECTED"
  | "PAYMENT_MALFORMED";

export class PayError extends Error {
  readonly code: PayErrorCode;
  readonly remediation?: string;

  constructor(code: PayErrorCode, message: string, remediation?: string) {
    super(message);
    this.name = "PayError";
    this.code = code;
    this.remediation = remediation;
  }
}
