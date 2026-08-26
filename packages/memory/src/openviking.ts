import { randomUUID } from "node:crypto";
import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import type { MemoryItem, MemoryScope, MemoryService } from "./contract.ts";
import { MemoryError } from "./errors.ts";
import {
  durableMemoryUri,
  isSessionScoped,
  kindOfUri,
  resourceUri,
  scoreText,
  sessionMemoryUri,
  sessionRoot,
  tenantRoot,
} from "./uris.ts";

export const OPENVIKING_BASE_URL = "http://127.0.0.1:1933";

export interface OpenVikingEntry {
  uri: string;
  text?: string;
  metadata?: Record<string, unknown>;
  score?: number;
}

/**
 * Minimal surface of the OpenViking server the memory service needs. The
 * default transport speaks HTTP to the loopback server; tests inject an
 * in-memory transport; `ovctl` drives the same surface from the box side.
 */
export interface OpenVikingTransport {
  healthy(): Promise<boolean>;
  write(uri: string, entry: { text: string; metadata?: Record<string, unknown> }): Promise<void>;
  read(uri: string): Promise<string | null>;
  search(query: string, opts: { root: string; limit: number }): Promise<OpenVikingEntry[]>;
  rm(uri: string, opts?: { recursive?: boolean }): Promise<void>;
  list(root: string): Promise<OpenVikingEntry[]>;
  addResource(filePath: string, to: string): Promise<void>;
}

export interface InMemoryTransportOptions {
  readFile?: (filePath: string) => Promise<string>;
}

/** In-memory stand-in for a running OpenViking server (contract tests, ovctl tests). */
export function createInMemoryTransport(options: InMemoryTransportOptions = {}): OpenVikingTransport {
  const readFile = options.readFile ?? (async (filePath: string) => fsReadFile(filePath, "utf8"));
  const entries = new Map<string, { text: string; metadata?: Record<string, unknown> }>();
  return {
    async healthy() {
      return true;
    },
    async write(uri, entry) {
      entries.set(uri, entry);
    },
    async read(uri) {
      return entries.get(uri)?.text ?? null;
    },
    async search(query, opts) {
      const hits: OpenVikingEntry[] = [];
      for (const [uri, entry] of entries) {
        if (!uri.startsWith(opts.root)) continue;
        const score = scoreText(query, entry.text);
        if (score > 0) hits.push({ uri, text: entry.text, score, ...(entry.metadata ? { metadata: entry.metadata } : {}) });
      }
      hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return hits.slice(0, opts.limit);
    },
    async rm(uri, opts) {
      entries.delete(uri);
      if (opts?.recursive === true) {
        const prefix = uri.endsWith("/") ? uri : `${uri}/`;
        for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
      }
    },
    async list(root) {
      const rows: OpenVikingEntry[] = [];
      for (const [uri, entry] of entries) {
        if (uri.startsWith(root)) rows.push({ uri, text: entry.text });
      }
      return rows;
    },
    async addResource(filePath, to) {
      entries.set(to, { text: await readFile(filePath) });
    },
  };
}

export interface HttpTransportOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Loopback HTTP transport. Endpoint shapes mirror the openviking-sdk HTTP
 * client (`/health` plus JSON POSTs under `/api/v1`); recorded as an assumed
 * provider fact in docs/verify-log.md — the opt-in docker contract run is the
 * verification path.
 */
export function createHttpTransport(options: HttpTransportOptions = {}): OpenVikingTransport {
  const baseUrl = options.baseUrl ?? OPENVIKING_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function call<T>(op: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetchImpl(`${baseUrl}/api/v1/${op}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new MemoryError("MEMORY_UNAVAILABLE", `openviking ${op} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    async healthy() {
      try {
        const res = await fetchImpl(`${baseUrl}/health`);
        return res.ok;
      } catch {
        return false;
      }
    },
    async write(uri, entry) {
      await call("write", { uri, text: entry.text, metadata: entry.metadata });
    },
    async read(uri) {
      const data = await call<{ text?: string | null }>("read", { uri });
      return data.text ?? null;
    },
    async search(query, opts) {
      const data = await call<{ results?: OpenVikingEntry[] }>("search", {
        query,
        root: opts.root,
        limit: opts.limit,
      });
      return data.results ?? [];
    },
    async rm(uri, opts) {
      await call("rm", { uri, recursive: opts?.recursive === true });
    },
    async list(root) {
      const data = await call<{ entries?: OpenVikingEntry[] }>("ls", { root });
      return data.entries ?? [];
    },
    async addResource(filePath, to) {
      await call("add-resource", { path: filePath, to });
    },
  };
}

export interface OpenVikingPaths {
  root: string;
  conf: string;
  data: string;
  venv: string;
}

export function openVikingPaths(home: string): OpenVikingPaths {
  const root = path.posix.join(home, ".zap", "memory", "openviking");
  return {
    root,
    conf: path.posix.join(root, "ov.conf"),
    data: path.posix.join(root, "data"),
    venv: path.posix.join(root, "venv"),
  };
}

export interface OvConfOptions {
  home: string;
  /** VLM routes through the gateway only with explicit consent; omitted by default. */
  vlm?: { provider: string; model: string; apiBase: string; apiKey: string };
}

/** Loopback-only OpenViking config: local AGFS, local vector store, local embeddings. */
export function renderOvConf(options: OvConfOptions): string {
  const paths = openVikingPaths(options.home);
  const conf: Record<string, unknown> = {
    storage: {
      workspace: paths.data,
      agfs: { backend: "local" },
      vectordb: { backend: "local" },
    },
    server: { host: "127.0.0.1", port: 1933, auth_mode: "dev" },
    log: { level: "warning" },
  };
  if (options.vlm !== undefined) {
    conf.vlm = {
      provider: options.vlm.provider,
      model: options.vlm.model,
      api_base: options.vlm.apiBase,
      api_key: options.vlm.apiKey,
      temperature: 0,
    };
  }
  return JSON.stringify(conf, null, 2);
}

export interface OpenVikingMemoryOptions {
  transport?: OpenVikingTransport;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/** On-VM memory service over the loopback OpenViking server. */
export function createOpenVikingMemory(options: OpenVikingMemoryOptions = {}): MemoryService {
  const baseUrl = options.baseUrl ?? OPENVIKING_BASE_URL;
  const transport =
    options.transport ??
    createHttpTransport({ baseUrl, ...(options.fetchImpl !== undefined ? { fetchImpl: options.fetchImpl } : {}) });

  const toItem = (entry: OpenVikingEntry): MemoryItem => ({
    uri: entry.uri,
    kind: kindOfUri(entry.uri),
    ...(entry.text !== undefined ? { text: entry.text } : {}),
    ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
    ...(entry.score !== undefined ? { score: entry.score } : {}),
  });

  return {
    provider: "openviking",
    locality: "on-vm",

    async status() {
      const healthy = await transport.healthy();
      if (!healthy) return { healthy: false, items: 0 };
      const rows = await transport.list("viking://user");
      let bytes = 0;
      for (const row of rows) bytes += Buffer.byteLength(row.text ?? "", "utf8");
      return { healthy: true, items: rows.length, bytes };
    },

    async remember(scope, input) {
      const id = randomUUID();
      const uri =
        isSessionScoped(scope, input.durable) && scope.sessionId !== undefined
          ? sessionMemoryUri(scope.tenantId, scope.sessionId, id)
          : durableMemoryUri(scope.tenantId, id);
      await transport.write(uri, {
        text: input.text,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      });
      return {
        uri,
        kind: "memory",
        text: input.text,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      };
    },

    async addResource(scope, input) {
      const uri = input.uri ?? resourceUri(scope.tenantId, path.basename(input.path));
      await transport.addResource(input.path, uri);
      return { uri, kind: "resource" };
    },

    async search(scope, query, opts) {
      const limit = opts?.limit ?? 10;
      const hits = await transport.search(query, { root: tenantRoot(scope.tenantId), limit: limit * 4 });
      const items = hits.map(toItem).filter((item) => opts?.kinds === undefined || opts.kinds.includes(item.kind));
      return items.slice(0, limit);
    },

    async read(scope, uri) {
      if (!uri.startsWith(`${tenantRoot(scope.tenantId)}/`)) return null;
      return transport.read(uri);
    },

    async forget(_scope, uri) {
      await transport.rm(uri);
    },

    async wipeSession(scope) {
      if (scope.sessionId === undefined) return;
      await transport.rm(sessionRoot(scope.tenantId, scope.sessionId), { recursive: true });
    },

    async export(scope) {
      const rows = await transport.list(tenantRoot(scope.tenantId));
      return (async function* stream() {
        for (const row of rows) yield toItem(row);
      })();
    },

    mcp() {
      return { url: `${baseUrl}/mcp` };
    },
  };
}
