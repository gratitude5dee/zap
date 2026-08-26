// Test helpers: an in-memory scope-checked secret resolver and a render
// convenience for asserting instructions/capabilities.
import { AgentCodeError, type ResolveSecret, type SecretScope } from "./types.ts";

export interface StaticSecretScope {
  agentId?: string;
  alias?: string;
  connectionId?: string;
}

/** in-memory resolver: values live only inside the closure, never serialized */
export function staticSecretResolver(options: {
  values: Record<string, string>;
  allow?: StaticSecretScope;
}): { resolve: ResolveSecret; lookups: string[] } {
  const lookups: string[] = [];
  const resolve: ResolveSecret = async (ref, scope: SecretScope) => {
    const allow = options.allow;
    if (
      allow &&
      ((allow.agentId !== undefined && allow.agentId !== scope.agentId) ||
        (allow.alias !== undefined && allow.alias !== scope.alias) ||
        (allow.connectionId !== undefined && allow.connectionId !== scope.connectionId))
    ) {
      throw new AgentCodeError("SECRET_SCOPE_DENIED", `secret ${ref.name} is out of scope.`);
    }
    const value = options.values[ref.name];
    if (value === undefined) {
      throw new AgentCodeError("SECRET_UNAVAILABLE", `secret ${ref.name} is not set.`);
    }
    lookups.push(ref.name);
    return value;
  };
  return { resolve, lookups };
}
