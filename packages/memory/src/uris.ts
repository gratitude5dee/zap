import type { MemoryItem, MemoryScope } from "./contract.ts";

export function tenantRoot(tenantId: string): string {
  return `viking://user/${tenantId}`;
}

export function durableMemoryUri(tenantId: string, id: string): string {
  return `${tenantRoot(tenantId)}/memories/${id}`;
}

export function sessionRoot(tenantId: string, sessionId: string): string {
  return `${tenantRoot(tenantId)}/sessions/${sessionId}`;
}

export function sessionMemoryUri(tenantId: string, sessionId: string, id: string): string {
  return `${sessionRoot(tenantId, sessionId)}/memories/${id}`;
}

export function resourceUri(tenantId: string, name: string): string {
  return `${tenantRoot(tenantId)}/resources/${name}`;
}

/** Session-scoped iff the scope names a session and the caller did not pin the item durable. */
export function isSessionScoped(scope: MemoryScope, durable: boolean | undefined): boolean {
  return scope.sessionId !== undefined && durable !== true;
}

export function kindOfUri(uri: string): MemoryItem["kind"] {
  if (uri.includes("/resources/")) return "resource";
  if (uri.includes("/skills/")) return "skill";
  if (uri.includes("/messages/")) return "message";
  return "memory";
}

export function scoreText(query: string, text: string): number {
  const haystack = text.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.filter((token) => haystack.includes(token)).length;
}
