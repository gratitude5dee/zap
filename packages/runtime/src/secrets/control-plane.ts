// Managed-secret resolver: asks the Zap control plane to resolve a SecretRef
// for this runtime (POST /v1/runtimes/{id}/secrets/resolve). The value is
// used for exactly one request and never persisted.
import type { SecretRef, SecretScope } from "@wzrdtech/zap-agent";
import { SecretError, type SecretResolver } from "./resolver.ts";

export interface ControlPlaneSecretOptions {
  baseUrl: string;
  runtimeId: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export function createControlPlaneSecretResolver(options: ControlPlaneSecretOptions): SecretResolver {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function call(body: Record<string, unknown>): Promise<string> {
    const response = await fetchImpl(
      `${options.baseUrl.replace(/\/$/, "")}/v1/runtimes/${encodeURIComponent(options.runtimeId)}/secrets/resolve`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${options.token}`,
        },
        body: JSON.stringify(body),
      },
    );
    if (response.status === 403) {
      throw new SecretError({ code: "SECRET_SCOPE_DENIED", message: "control plane denied the secret scope." });
    }
    if (!response.ok) {
      throw new SecretError({
        code: "SECRET_UNAVAILABLE",
        message: `control plane could not resolve the secret (status ${response.status}).`,
      });
    }
    const payload = (await response.json()) as { value?: string };
    if (typeof payload.value !== "string") {
      throw new SecretError({ code: "SECRET_UNAVAILABLE", message: "control plane returned no value." });
    }
    return payload.value;
  }

  return {
    async resolve(ref: SecretRef, scope: SecretScope): Promise<string> {
      return call({ kind: "secret", name: ref.name, scope });
    },
    async gatewayKey(route: string): Promise<string> {
      return call({ kind: "gateway", route });
    },
  };
}
