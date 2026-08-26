export type KernelErrorCode =
  | "SERVICE_MISSING"
  | "PLUGIN_FAILED"
  | "CYCLE_DETECTED"
  | "DISPOSED"
  | "NOT_IMPLEMENTED";

export class KernelError extends Error {
  readonly code: KernelErrorCode;

  constructor(code: KernelErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "KernelError";
    this.code = code;
  }
}

export class ServiceMissingError extends KernelError {
  readonly key: string;

  constructor(key: string) {
    super("SERVICE_MISSING", `service "${key}" was never provided before dispose`);
    this.name = "ServiceMissingError";
    this.key = key;
  }
}

export class PluginFailedError extends KernelError {
  readonly plugin: string;

  constructor(plugin: string, cause: unknown) {
    super("PLUGIN_FAILED", `plugin "${plugin}" failed to apply`, { cause });
    this.name = "PluginFailedError";
    this.plugin = plugin;
  }
}

export class CycleDetectedError extends KernelError {
  readonly chain: readonly string[];

  constructor(chain: readonly string[]) {
    super("CYCLE_DETECTED", `provider-precedence cycle: ${chain.join(" -> ")}`);
    this.name = "CycleDetectedError";
    this.chain = chain;
  }
}

export class DisposedError extends KernelError {
  constructor(what: string) {
    super("DISPOSED", `${what} is disposed`);
    this.name = "DisposedError";
  }
}

export class NotImplementedError extends KernelError {
  constructor(what: string) {
    super("NOT_IMPLEMENTED", `${what} is not implemented yet`);
    this.name = "NotImplementedError";
  }
}
