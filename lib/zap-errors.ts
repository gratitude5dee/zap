export type ZapErrorCode =
  | "BUDGET_EXCEEDED"
  | "CONVEX_UNAVAILABLE"
  | "INVALID_INPUT"
  | "JUDGE_FAILED"
  | "LOCAL_STEP_FAILED"
  | "PROVIDER_UNSUPPORTED"
  | "RUN_CANCELED"
  | "RUN_NOT_FOUND"
  | "SCHEMA_INVALID"
  | "UNKNOWN_MODEL"
  | "UNKNOWN_ZAP";

export type ZapErrorPayload = {
  alternatives?: string[];
  code: ZapErrorCode;
  message: string;
  remediation: string;
  retryable: boolean;
};

export class ZapRunError extends Error {
  readonly alternatives?: string[];
  readonly code: ZapErrorCode;
  readonly remediation: string;
  readonly retryable: boolean;

  constructor(payload: ZapErrorPayload) {
    super(payload.message);
    this.name = "ZapRunError";
    this.alternatives = payload.alternatives;
    this.code = payload.code;
    this.remediation = payload.remediation;
    this.retryable = payload.retryable;
  }

  toJSON(): ZapErrorPayload {
    return {
      alternatives: this.alternatives,
      code: this.code,
      message: this.message,
      remediation: this.remediation,
      retryable: this.retryable,
    };
  }
}

export function toZapErrorMessage(error: unknown, fallback = "Zap run failed."): string {
  if (typeof error === "string") return error.trim() || fallback;
  if (typeof error !== "object" || error === null || Array.isArray(error)) return fallback;

  const payload = error as { message?: unknown; remediation?: unknown };
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const remediation = typeof payload.remediation === "string" ? payload.remediation.trim() : "";
  if (message && remediation && remediation !== message) return `${message} ${remediation}`;
  return message || remediation || fallback;
}

export function toZapErrorPayload(error: unknown): ZapErrorPayload {
  if (error instanceof ZapRunError) return error.toJSON();
  return {
    code: "SCHEMA_INVALID",
    message: error instanceof Error ? error.message : "Zap run failed.",
    remediation: "Inspect the run input and recipe, then retry after correcting the reported issue.",
    retryable: false,
  };
}
