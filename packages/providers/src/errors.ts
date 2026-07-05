export class ProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, options: { code: string; retryable?: boolean; status?: number }) {
    super(message);
    this.name = "ProviderError";
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
  }
}

export function redactedError(error: unknown) {
  if (error instanceof ProviderError) return error;
  return new ProviderError(error instanceof Error ? error.message : String(error), {
    code: "PROVIDER_ERROR",
    retryable: true,
  });
}
