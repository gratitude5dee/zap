// Secret plumbing helpers: classify header values and collect referenced
// secret names. Values never flow through this module.
import type { ConnectionDefinition, HeaderValue, McpServerDefinition, SecretRef } from "./types.ts";

export function headerSecretRef(value: HeaderValue): SecretRef | undefined {
  if (typeof value === "string") return undefined;
  if (value.__brand === "SecretRef") return value;
  return value.ref;
}

/** header names whose values come from secret refs (always sensitive) */
export function sensitiveHeaderNames(def: {
  headers?: Record<string, HeaderValue>;
  sensitiveHeaders?: readonly string[];
}): string[] {
  const names = new Set<string>(def.sensitiveHeaders ?? []);
  for (const [name, value] of Object.entries(def.headers ?? {})) {
    if (headerSecretRef(value)) names.add(name);
  }
  return [...names].sort();
}

export function secretsReferencedBy(
  connections: readonly ConnectionDefinition[],
  mcpServers: readonly McpServerDefinition[],
): string[] {
  const names = new Set<string>();
  for (const def of [...connections, ...mcpServers]) {
    for (const value of Object.values(def.headers ?? {})) {
      const ref = headerSecretRef(value);
      if (ref) names.add(ref.name);
    }
  }
  return [...names].sort();
}
