// Manifest allowlist (§5.12): before any secret lookup, the requested scope
// (agent, alias, connection, destination origin/method/path) must match what
// the deployed manifest declares. Fail closed with SECRET_SCOPE_DENIED.
import type { AgentManifestEntry, SecretScope } from "@wzrdtech/zap-agent";
import { SecretError } from "../secrets/resolver.ts";

export function checkSecretScope(entry: AgentManifestEntry | undefined, scope: SecretScope, secretName: string): void {
  const deny = (reason: string): never => {
    throw new SecretError({
      code: "SECRET_SCOPE_DENIED",
      message: `secret ${secretName} denied: ${reason}`,
    });
  };

  if (!entry) deny(`agent ${scope.agentId} is not in the deployment manifest.`);
  const connection = entry?.connections.find((candidate) => candidate.id === scope.connectionId);
  if (!connection) return deny(`connection ${scope.connectionId} is not declared by agent ${scope.agentId}.`);
  if (connection.origin !== scope.origin) return deny(`origin ${scope.origin} is not the declared origin.`);
  if (!connection.methods.includes(scope.method.toUpperCase())) {
    return deny(`method ${scope.method} is not allowed for connection ${scope.connectionId}.`);
  }
  if (!scope.path.startsWith(connection.pathPrefix)) {
    return deny(`path ${scope.path} is outside ${connection.pathPrefix}.`);
  }
  if (!entry.secretsReferenced.includes(secretName)) {
    return deny(`secret ${secretName} is not declared by agent ${scope.agentId}.`);
  }
}
