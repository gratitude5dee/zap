// SecretResolver (§5.12): resolves a write-only SecretRef immediately before
// a request; scope is validated by the caller (connections/allowlist) first.
// Gateway keys are a separate namespace never reachable from tools.
import type { SecretRef, SecretScope } from "@wzrdtech/zap-agent";

export interface SecretResolver {
  resolve(ref: SecretRef, scope: SecretScope): Promise<string>;
  gatewayKey(route: string): Promise<string>;
}

export class SecretError extends Error {
  readonly code: "SECRET_UNAVAILABLE" | "SECRET_SCOPE_DENIED" | "GATEWAY_KEY_UNAVAILABLE";
  readonly remediation?: string;

  constructor(options: { code: SecretError["code"]; message: string; remediation?: string }) {
    super(options.message);
    this.name = "SecretError";
    this.code = options.code;
    this.remediation = options.remediation;
  }
}
