// @ts-check

/**
 * Shared structured-error plumbing for every Zap CLI command (C28).
 *
 * Exit codes: 0 = success, 1 = runtime error, 2 = usage error
 * (unknown command / invalid arguments on v5 commands).
 */

/** @typedef {{ code: string, message: string, remediation?: string | string[], retryable?: boolean, alternatives?: string[] }} ZapCliErrorPayload */

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

export class ZapCliError extends Error {
  /**
   * @param {ZapCliErrorPayload & { exitCode?: number }} payload
   */
  constructor(payload) {
    super(payload.message);
    this.name = "ZapCliError";
    this.code = payload.code;
    this.remediation = payload.remediation;
    this.retryable = payload.retryable ?? false;
    this.alternatives = payload.alternatives;
    this.exitCode = payload.exitCode ?? EXIT_ERROR;
  }

  /** @returns {ZapCliErrorPayload} */
  toJSON() {
    /** @type {ZapCliErrorPayload} */
    const payload = { code: this.code, message: this.message, retryable: this.retryable };
    if (this.remediation !== undefined) payload.remediation = this.remediation;
    if (this.alternatives !== undefined) payload.alternatives = this.alternatives;
    return payload;
  }
}

/**
 * @param {string} message
 * @param {string} [code]
 */
export function usageError(message, code = "USAGE") {
  return new ZapCliError({ code, message, exitCode: EXIT_USAGE });
}

/**
 * Normalizes any thrown value into a structured payload for `--json` output.
 * @param {unknown} error
 * @returns {ZapCliErrorPayload}
 */
export function toErrorPayload(error) {
  if (error instanceof ZapCliError) return error.toJSON();
  if (error && typeof error === "object" && "code" in error && "message" in error && typeof (/** @type {{code: unknown}} */ (error).code) === "string") {
    const known = /** @type {{ code: string, message: unknown, remediation?: unknown, retryable?: unknown }} */ (error);
    return {
      code: known.code,
      message: typeof known.message === "string" ? known.message : String(known.message),
      remediation: typeof known.remediation === "string" || Array.isArray(known.remediation) ? known.remediation : undefined,
      retryable: typeof known.retryable === "boolean" ? known.retryable : false,
    };
  }
  return {
    code: "ERROR",
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

/**
 * @param {unknown} error
 * @returns {number}
 */
export function exitCodeFor(error) {
  if (error instanceof ZapCliError) return error.exitCode;
  return EXIT_ERROR;
}
