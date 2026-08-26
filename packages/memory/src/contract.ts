export interface MemoryScope {
  tenantId: string;
  runtimeId: string;
  sessionId?: string;
}

export interface MemoryItem {
  uri: string;
  kind: "memory" | "resource" | "skill" | "message";
  text?: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

/**
 * Locality rule: remember/search/read/addResource are available in-VM and to
 * the self-host CLI only. The managed control API surfaces
 * status/forget/export; a MemoryService instantiated there throws
 * MEMORY_CONTENT_OFF_VM for content methods.
 */
export interface MemoryService {
  readonly provider: "openviking" | "mem0" | "zep";
  readonly locality: "on-vm" | "saas";
  status(): Promise<{ healthy: boolean; items: number; bytes?: number }>;
  remember(
    scope: MemoryScope,
    input: { text: string; metadata?: Record<string, unknown>; durable?: boolean },
  ): Promise<MemoryItem>;
  addResource(scope: MemoryScope, input: { path: string; uri?: string }): Promise<MemoryItem>;
  search(
    scope: MemoryScope,
    query: string,
    opts?: { limit?: number; kinds?: MemoryItem["kind"][] },
  ): Promise<MemoryItem[]>;
  read(scope: MemoryScope, uri: string): Promise<string | null>;
  forget(scope: MemoryScope, uri: string): Promise<void>;
  /** dispose: session-scoped keys only; durable tenant memory stays */
  wipeSession(scope: MemoryScope): Promise<void>;
  /** managed mode requires consent on the runtime row */
  export(scope: MemoryScope): Promise<AsyncIterable<MemoryItem>>;
  /** on-vm providers expose an MCP endpoint for harnesses */
  mcp?(): { url: string };
}
