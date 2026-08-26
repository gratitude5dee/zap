export type MemoryErrorCode =
  | "MEMORY_CONTENT_OFF_VM"
  | "MEMORY_CONSENT_REQUIRED"
  | "MEMORY_UNAVAILABLE";

export class MemoryError extends Error {
  readonly code: MemoryErrorCode;

  constructor(code: MemoryErrorCode, message: string) {
    super(message);
    this.name = "MemoryError";
    this.code = code;
  }
}
