// Per-agent connection fetchers: agent-code's allowlisted fetch wired to the
// deployment-manifest scope check and the runtime SecretResolver.
import {
  createConnectionFetch,
  type AgentManifestEntry,
  type ConnectionDefinition,
  type ConnectionFetch,
  type ConnectionScope,
  type ResolveSecret,
} from "@wzrdtech/zap-agent";
import type { SecretResolver } from "../secrets/resolver.ts";
import { checkSecretScope } from "./allowlist.ts";

export interface AgentConnectionsOptions {
  entry: AgentManifestEntry | undefined;
  scope: ConnectionScope;
  resolver: SecretResolver;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
}

export function createAgentConnections(
  definitions: readonly ConnectionDefinition[],
  options: AgentConnectionsOptions,
): Record<string, ConnectionFetch> {
  const resolveSecret: ResolveSecret = async (ref, scope) => {
    checkSecretScope(options.entry, scope, ref.name);
    return options.resolver.resolve(ref, scope);
  };
  const connections: Record<string, ConnectionFetch> = {};
  for (const definition of definitions) {
    connections[definition.id] = createConnectionFetch(definition, {
      scope: options.scope,
      resolveSecret,
      fetchImpl: options.fetchImpl,
    });
  }
  return connections;
}
