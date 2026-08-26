import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryItem, MemoryScope, MemoryService } from "./contract.ts";
import { MemoryError } from "./errors.ts";
import { isSessionScoped } from "./uris.ts";

export const MEM0_BASE_URL = "https://api.mem0.ai";

export interface Mem0MemoryOptions {
  /** SaaS provider: memory content leaves the VM. Must be an explicit true (recorded on the runtime row). */
  consent: boolean;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  readFile?: (filePath: string) => Promise<string>;
}

interface Mem0Row {
  id: string;
  memory: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

function uriOf(tenantId: string, id: string): string {
  return `mem0://${tenantId}/${id}`;
}

function idOf(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

function kindOf(row: Mem0Row): MemoryItem["kind"] {
  const kind = row.metadata?.zap_kind;
  return kind === "resource" || kind === "skill" || kind === "message" ? kind : "memory";
}

/**
 * Mem0 SaaS adapter: `user_id = tenantId`, `run_id = sessionId`. REST shapes
 * (v1 memories endpoints, `Authorization: Token`) are assumed provider facts
 * recorded in docs/verify-log.md; the opt-in keyed contract run verifies them.
 */
export function createMem0Memory(options: Mem0MemoryOptions): MemoryService {
  if (options.consent !== true) {
    throw new MemoryError(
      "MEMORY_CONSENT_REQUIRED",
      "memory.mem0 is a SaaS provider: enabling it moves memory content off the VM and requires consent: true",
    );
  }
  const baseUrl = options.baseUrl ?? MEM0_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const readFile = options.readFile ?? (async (filePath: string) => fsReadFile(filePath, "utf8"));

  async function call<T>(pathname: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (options.apiKey !== undefined) headers.authorization = `Token ${options.apiKey}`;
    const res = await fetchImpl(`${baseUrl}${pathname}`, { ...init, headers });
    const data = (res.status === 204 ? null : await res.json().catch(() => null)) as T;
    return { ok: res.ok, status: res.status, data };
  }

  async function add(
    scope: MemoryScope,
    text: string,
    metadata: Record<string, unknown> | undefined,
    sessionScoped: boolean,
  ): Promise<Mem0Row> {
    const body: Record<string, unknown> = {
      messages: [{ role: "user", content: text }],
      user_id: scope.tenantId,
      infer: false,
    };
    if (sessionScoped && scope.sessionId !== undefined) body.run_id = scope.sessionId;
    if (metadata !== undefined) body.metadata = metadata;
    const { ok, data } = await call<Mem0Row[]>("/v1/memories/", { method: "POST", body: JSON.stringify(body) });
    const row = data?.[0];
    if (!ok || row === undefined) throw new MemoryError("MEMORY_UNAVAILABLE", "mem0 add failed");
    return { ...row, memory: row.memory ?? text, ...(metadata !== undefined ? { metadata } : {}) };
  }

  const toItem = (scope: MemoryScope, row: Mem0Row): MemoryItem => ({
    uri: uriOf(scope.tenantId, row.id),
    kind: kindOf(row),
    text: row.memory,
    ...(row.metadata !== undefined ? { metadata: row.metadata } : {}),
    ...(row.score !== undefined ? { score: row.score } : {}),
  });

  return {
    provider: "mem0",
    locality: "saas",

    async status() {
      const { ok } = await call<unknown>(`/v1/memories/?user_id=${encodeURIComponent("zap-health")}`);
      return { healthy: ok, items: 0 };
    },

    async remember(scope, input) {
      const row = await add(scope, input.text, input.metadata, isSessionScoped(scope, input.durable));
      return toItem(scope, row);
    },

    async addResource(scope, input) {
      const text = await readFile(input.path);
      const row = await add(scope, text, { zap_kind: "resource", zap_path: input.path }, false);
      return toItem(scope, row);
    },

    async search(scope, query, opts) {
      const limit = opts?.limit ?? 10;
      const { data } = await call<Mem0Row[]>("/v1/memories/search/", {
        method: "POST",
        body: JSON.stringify({ query, user_id: scope.tenantId, limit: limit * 4 }),
      });
      const items = (data ?? [])
        .map((row) => toItem(scope, row))
        .filter((item) => opts?.kinds === undefined || opts.kinds.includes(item.kind));
      return items.slice(0, limit);
    },

    async read(scope, uri) {
      if (!uri.startsWith(`mem0://${scope.tenantId}/`)) return null;
      const { ok, data } = await call<Mem0Row>(`/v1/memories/${encodeURIComponent(idOf(uri))}/`);
      if (!ok) return null;
      return data?.memory ?? null;
    },

    async forget(_scope, uri) {
      await call<unknown>(`/v1/memories/${encodeURIComponent(idOf(uri))}/`, { method: "DELETE" });
    },

    async wipeSession(scope) {
      if (scope.sessionId === undefined) return;
      await call<unknown>(
        `/v1/memories/?user_id=${encodeURIComponent(scope.tenantId)}&run_id=${encodeURIComponent(scope.sessionId)}`,
        { method: "DELETE" },
      );
    },

    async export(scope) {
      const { data } = await call<Mem0Row[]>(`/v1/memories/?user_id=${encodeURIComponent(scope.tenantId)}`);
      const items = (data ?? []).map((row) => toItem(scope, row));
      return (async function* stream() {
        for (const item of items) yield item;
      })();
    },
  };
}
