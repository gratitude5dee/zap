// Runtime-memory secret store synced from the developer machine (`zap secret
// sync`). Values live only in this process's memory: they are never written
// to /zap/**, snapshots, logs, or events. Gateway keys are held in a separate
// map that connection/tool code cannot address.
import type { SecretRef, SecretScope } from "@wzrdtech/zap-agent";
import { SecretError, type SecretResolver } from "./resolver.ts";

export interface EnvSecretResolver extends SecretResolver {
  sync(values: Record<string, string>): void;
  syncGateway(values: Record<string, string>): void;
  names(): string[];
}

export function createEnvSecretResolver(initial?: Record<string, string>): EnvSecretResolver {
  const values = new Map<string, string>(Object.entries(initial ?? {}));
  const gateway = new Map<string, string>();

  return {
    sync(next) {
      for (const [name, value] of Object.entries(next)) values.set(name, value);
    },
    syncGateway(next) {
      for (const [route, value] of Object.entries(next)) gateway.set(route, value);
    },
    names() {
      return [...values.keys()].sort();
    },
    async resolve(ref: SecretRef, scope: SecretScope): Promise<string> {
      void scope; // scope allowlisting happens before this resolver is reached
      const value = values.get(ref.name);
      if (value === undefined) {
        throw new SecretError({
          code: "SECRET_UNAVAILABLE",
          message: `secret ${ref.name} is not available on this runtime.`,
          remediation: `run \`zap secret set ${ref.name}\` then \`zap secret sync\`.`,
        });
      }
      return value;
    },
    async gatewayKey(route: string): Promise<string> {
      const value = gateway.get(route);
      if (value === undefined) {
        throw new SecretError({
          code: "GATEWAY_KEY_UNAVAILABLE",
          message: `no gateway key for route ${route}.`,
        });
      }
      return value;
    },
  };
}
