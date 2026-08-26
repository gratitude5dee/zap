import { randomUUID } from "node:crypto";
import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryItem, MemoryScope, MemoryService } from "./contract.ts";
import {
  durableMemoryUri,
  isSessionScoped,
  resourceUri,
  scoreText,
  sessionMemoryUri,
  sessionRoot,
} from "./uris.ts";

export interface FakeMemoryOptions {
  provider?: MemoryService["provider"];
  readFile?: (filePath: string) => Promise<string>;
}

interface StoredItem {
  uri: string;
  kind: MemoryItem["kind"];
  text: string;
  metadata?: Record<string, unknown>;
  tenantId: string;
  sessionId?: string;
}

/** In-process reference implementation of the memory contract, for tests. */
export function createFakeMemory(options: FakeMemoryOptions = {}): MemoryService {
  const provider = options.provider ?? "openviking";
  const readFile = options.readFile ?? (async (filePath: string) => fsReadFile(filePath, "utf8"));
  const items = new Map<string, StoredItem>();

  const toItem = (stored: StoredItem, score?: number): MemoryItem => ({
    uri: stored.uri,
    kind: stored.kind,
    text: stored.text,
    ...(stored.metadata !== undefined ? { metadata: stored.metadata } : {}),
    ...(score !== undefined ? { score } : {}),
  });

  return {
    provider,
    locality: "on-vm",

    async status() {
      let bytes = 0;
      for (const stored of items.values()) bytes += Buffer.byteLength(stored.text, "utf8");
      return { healthy: true, items: items.size, bytes };
    },

    async remember(scope, input) {
      const id = randomUUID();
      const sessionScoped = isSessionScoped(scope, input.durable);
      const uri =
        sessionScoped && scope.sessionId !== undefined
          ? sessionMemoryUri(scope.tenantId, scope.sessionId, id)
          : durableMemoryUri(scope.tenantId, id);
      const stored: StoredItem = {
        uri,
        kind: "memory",
        text: input.text,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        tenantId: scope.tenantId,
        ...(sessionScoped && scope.sessionId !== undefined ? { sessionId: scope.sessionId } : {}),
      };
      items.set(uri, stored);
      return toItem(stored);
    },

    async addResource(scope, input) {
      const text = await readFile(input.path);
      const uri = input.uri ?? resourceUri(scope.tenantId, path.basename(input.path));
      const stored: StoredItem = { uri, kind: "resource", text, tenantId: scope.tenantId };
      items.set(uri, stored);
      return toItem(stored);
    },

    async search(scope, query, opts) {
      const limit = opts?.limit ?? 10;
      const hits: MemoryItem[] = [];
      for (const stored of items.values()) {
        if (stored.tenantId !== scope.tenantId) continue;
        if (opts?.kinds !== undefined && !opts.kinds.includes(stored.kind)) continue;
        const score = scoreText(query, stored.text);
        if (score > 0) hits.push(toItem(stored, score));
      }
      hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return hits.slice(0, limit);
    },

    async read(scope, uri) {
      const stored = items.get(uri);
      if (stored === undefined || stored.tenantId !== scope.tenantId) return null;
      return stored.text;
    },

    async forget(_scope, uri) {
      items.delete(uri);
    },

    async wipeSession(scope) {
      if (scope.sessionId === undefined) return;
      const root = sessionRoot(scope.tenantId, scope.sessionId);
      for (const [uri, stored] of items) {
        if (stored.tenantId === scope.tenantId && (stored.sessionId === scope.sessionId || uri.startsWith(root))) {
          items.delete(uri);
        }
      }
    },

    async export(scope) {
      const rows = [...items.values()].filter((stored) => stored.tenantId === scope.tenantId).map((s) => toItem(s));
      return (async function* stream() {
        for (const row of rows) yield row;
      })();
    },
  };
}
