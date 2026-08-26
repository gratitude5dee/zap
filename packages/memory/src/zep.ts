import { readFile as fsReadFile } from "node:fs/promises";
import type { MemoryItem, MemoryScope, MemoryService } from "./contract.ts";
import { MemoryError } from "./errors.ts";
import { isSessionScoped, scoreText } from "./uris.ts";

export const ZEP_BASE_URL = "https://api.getzep.com";

export interface ZepMemoryOptions {
  /** SaaS provider: memory content leaves the VM. Must be an explicit true (recorded on the runtime row). */
  consent: boolean;
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  readFile?: (filePath: string) => Promise<string>;
}

interface ZepEpisode {
  uuid: string;
  content: string;
  score?: number;
}

interface ZepPayload {
  zap_kind?: MemoryItem["kind"];
  text?: string;
}

function threadIdOf(scope: MemoryScope): string {
  return `zap-${scope.tenantId}-${scope.sessionId ?? ""}`;
}

function decode(content: string): { text: string; kind: MemoryItem["kind"] } {
  try {
    const parsed = JSON.parse(content) as ZepPayload;
    if (parsed !== null && typeof parsed === "object" && typeof parsed.text === "string") {
      const kind = parsed.zap_kind;
      return {
        text: parsed.text,
        kind: kind === "resource" || kind === "skill" || kind === "message" ? kind : "memory",
      };
    }
  } catch {
    // plain text episode
  }
  return { text: content, kind: "memory" };
}

/**
 * Zep SaaS adapter: user graph = tenant, thread = session. Durable tenant
 * memory is a graph episode; session memory is a thread message removed with
 * the thread on wipeSession. REST shapes (v2 graph/threads, `Authorization:
 * Api-Key`) are assumed provider facts recorded in docs/verify-log.md; the
 * opt-in keyed contract run verifies them.
 */
export function createZepMemory(options: ZepMemoryOptions): MemoryService {
  if (options.consent !== true) {
    throw new MemoryError(
      "MEMORY_CONSENT_REQUIRED",
      "memory.zep is a SaaS provider: enabling it moves memory content off the VM and requires consent: true",
    );
  }
  const baseUrl = options.baseUrl ?? ZEP_BASE_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const readFile = options.readFile ?? (async (filePath: string) => fsReadFile(filePath, "utf8"));

  async function call<T>(pathname: string, init?: RequestInit): Promise<{ ok: boolean; data: T }> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (options.apiKey !== undefined) headers.authorization = `Api-Key ${options.apiKey}`;
    const res = await fetchImpl(`${baseUrl}${pathname}`, { ...init, headers });
    const data = (await res.json().catch(() => null)) as T;
    return { ok: res.ok, data };
  }

  async function addGraphEpisode(scope: MemoryScope, data: string): Promise<string> {
    const { ok, data: body } = await call<{ uuid?: string }>("/api/v2/graph", {
      method: "POST",
      body: JSON.stringify({ user_id: scope.tenantId, type: "text", data }),
    });
    if (!ok || body?.uuid === undefined) throw new MemoryError("MEMORY_UNAVAILABLE", "zep graph add failed");
    return body.uuid;
  }

  async function ensureThread(scope: MemoryScope): Promise<string> {
    const threadId = threadIdOf(scope);
    await call<unknown>("/api/v2/threads", {
      method: "POST",
      body: JSON.stringify({ thread_id: threadId, user_id: scope.tenantId }),
    });
    return threadId;
  }

  async function threadMessages(scope: MemoryScope): Promise<Array<{ uuid: string; content: string }>> {
    if (scope.sessionId === undefined) return [];
    const { data } = await call<{ messages?: Array<{ uuid: string; content: string }> }>(
      `/api/v2/threads/${encodeURIComponent(threadIdOf(scope))}/messages`,
    );
    return data?.messages ?? [];
  }

  const graphItem = (episode: ZepEpisode): MemoryItem => {
    const { text, kind } = decode(episode.content);
    return {
      uri: `zep://graph/${episode.uuid}`,
      kind,
      text,
      ...(episode.score !== undefined ? { score: episode.score } : {}),
    };
  };

  const threadItem = (scope: MemoryScope, message: { uuid: string; content: string }, score?: number): MemoryItem => ({
    uri: `zep://thread/${threadIdOf(scope)}/${message.uuid}`,
    kind: "memory",
    text: message.content,
    ...(score !== undefined ? { score } : {}),
  });

  return {
    provider: "zep",
    locality: "saas",

    async status() {
      try {
        const res = await fetchImpl(`${baseUrl}/healthz`);
        return { healthy: res.ok, items: 0 };
      } catch {
        return { healthy: false, items: 0 };
      }
    },

    async remember(scope, input) {
      if (isSessionScoped(scope, input.durable) && scope.sessionId !== undefined) {
        const threadId = await ensureThread(scope);
        const { ok, data } = await call<{ message_uuids?: string[] }>(
          `/api/v2/threads/${encodeURIComponent(threadId)}/messages`,
          { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: input.text }] }) },
        );
        const uuid = data?.message_uuids?.[0];
        if (!ok || uuid === undefined) throw new MemoryError("MEMORY_UNAVAILABLE", "zep thread add failed");
        return { uri: `zep://thread/${threadId}/${uuid}`, kind: "memory", text: input.text };
      }
      const uuid = await addGraphEpisode(scope, input.text);
      return {
        uri: `zep://graph/${uuid}`,
        kind: "memory",
        text: input.text,
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      };
    },

    async addResource(scope, input) {
      const text = await readFile(input.path);
      const uuid = await addGraphEpisode(scope, JSON.stringify({ zap_kind: "resource", text } satisfies ZepPayload));
      return { uri: `zep://graph/${uuid}`, kind: "resource", text };
    },

    async search(scope, query, opts) {
      const limit = opts?.limit ?? 10;
      const { data } = await call<{ episodes?: ZepEpisode[] }>("/api/v2/graph/search", {
        method: "POST",
        body: JSON.stringify({ user_id: scope.tenantId, query, scope: "episodes", limit: limit * 4 }),
      });
      const hits: MemoryItem[] = (data?.episodes ?? []).map(graphItem);
      for (const message of await threadMessages(scope)) {
        const score = scoreText(query, message.content);
        if (score > 0) hits.push(threadItem(scope, message, score));
      }
      hits.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      return hits.filter((item) => opts?.kinds === undefined || opts.kinds.includes(item.kind)).slice(0, limit);
    },

    async read(scope, uri) {
      const graphMatch = uri.match(/^zep:\/\/graph\/(.+)$/);
      if (graphMatch?.[1] !== undefined) {
        const { ok, data } = await call<{ content?: string }>(
          `/api/v2/graph/episodes/${encodeURIComponent(graphMatch[1])}`,
        );
        if (!ok || data?.content === undefined) return null;
        return decode(data.content).text;
      }
      const threadMatch = uri.match(/^zep:\/\/thread\/([^/]+)\/(.+)$/);
      if (threadMatch?.[1] !== undefined && threadMatch[2] !== undefined) {
        const { data } = await call<{ messages?: Array<{ uuid: string; content: string }> }>(
          `/api/v2/threads/${encodeURIComponent(threadMatch[1])}/messages`,
        );
        return data?.messages?.find((message) => message.uuid === threadMatch[2])?.content ?? null;
      }
      return null;
    },

    async forget(_scope, uri) {
      const graphMatch = uri.match(/^zep:\/\/graph\/(.+)$/);
      if (graphMatch?.[1] !== undefined) {
        await call<unknown>(`/api/v2/graph/episodes/${encodeURIComponent(graphMatch[1])}`, { method: "DELETE" });
        return;
      }
      const threadMatch = uri.match(/^zep:\/\/thread\/([^/]+)\/(.+)$/);
      if (threadMatch?.[1] !== undefined && threadMatch[2] !== undefined) {
        await call<unknown>(
          `/api/v2/threads/${encodeURIComponent(threadMatch[1])}/messages/${encodeURIComponent(threadMatch[2])}`,
          { method: "DELETE" },
        );
      }
    },

    async wipeSession(scope) {
      if (scope.sessionId === undefined) return;
      await call<unknown>(`/api/v2/threads/${encodeURIComponent(threadIdOf(scope))}`, { method: "DELETE" });
    },

    async export(scope) {
      const { data } = await call<{ episodes?: ZepEpisode[] }>(
        `/api/v2/graph/episodes?user_id=${encodeURIComponent(scope.tenantId)}`,
      );
      const items: MemoryItem[] = (data?.episodes ?? []).map(graphItem);
      for (const message of await threadMessages(scope)) items.push(threadItem(scope, message));
      return (async function* stream() {
        for (const item of items) yield item;
      })();
    },
  };
}
