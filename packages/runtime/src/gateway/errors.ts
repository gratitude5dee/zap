export type GatewayErrorCode =
  | "LIVE_REQUIRED"
  | "KEY_MISSING"
  | "KEY_UNAVAILABLE"
  | "ROUTE_UNKNOWN"
  | "MODEL_INCOMPATIBLE";

export class GatewayError extends Error {
  readonly code: GatewayErrorCode;
  readonly remediation?: string;

  constructor(options: { code: GatewayErrorCode; message: string; remediation?: string }) {
    super(options.message);
    this.name = "GatewayError";
    this.code = options.code;
    this.remediation = options.remediation;
  }
}
