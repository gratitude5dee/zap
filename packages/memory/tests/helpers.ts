import type { MemoryService } from "../src/contract.ts";

export interface ProviderCase {
  name: string;
  /** fresh service per test; files maps a fake path to file contents for addResource */
  make(files?: Record<string, string>): MemoryService;
}

export function fileReader(files: Record<string, string>): (path: string) => Promise<string> {
  return async (path: string) => {
    const text = files[path];
    if (text === undefined) throw new Error(`no such file: ${path}`);
    return text;
  };
}

/**
 * In-memory fetch mock that emulates the Mem0 REST surface the adapter
 * targets: POST /v1/memories/, POST /v1/memories/search/,
 * GET|DELETE /v1/memories/{id}/, GET|DELETE /v1/memories/?user_id=&run_id=.
 */
export function createMem0FetchMock(): typeof fetch {
  interface Row {
    id: string;
    memory: string;
    user_id: string;
    run_id?: string;
    metadata?: Record<string, unknown>;
  }
  const rows = new Map<string, Row>();
  let seq = 0;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (url.pathname === "/v1/memories/" && method === "POST") {
      const messages = body.messages as Array<{ content: string }>;
      const id = `m${(seq += 1)}`;
      const row: Row = {
        id,
        memory: messages[0]?.content ?? "",
        user_id: String(body.user_id),
        run_id: typeof body.run_id === "string" ? body.run_id : undefined,
        metadata: body.metadata as Record<string, unknown> | undefined,
      };
      rows.set(id, row);
      return json([{ id, memory: row.memory }]);
    }
    if (url.pathname === "/v1/memories/search/" && method === "POST") {
      const query = String(body.query).toLowerCase();
      const tokens = query.split(/\s+/).filter(Boolean);
      const hits = [...rows.values()]
        .filter((row) => row.user_id === body.user_id)
        .map((row) => ({
          id: row.id,
          memory: row.memory,
          metadata: row.metadata,
          score: tokens.filter((t) => row.memory.toLowerCase().includes(t)).length,
        }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score);
      return json(hits);
    }
    const idMatch = url.pathname.match(/^\/v1\/memories\/([^/]+)\/$/);
    if (idMatch && idMatch[1] !== undefined && method === "GET") {
      const row = rows.get(idMatch[1]);
      return row ? json({ id: row.id, memory: row.memory, metadata: row.metadata }) : json({ detail: "not found" }, 404);
    }
    if (idMatch && idMatch[1] !== undefined && method === "DELETE") {
      rows.delete(idMatch[1]);
      return json({ message: "deleted" });
    }
    if (url.pathname === "/v1/memories/" && method === "GET") {
      const userId = url.searchParams.get("user_id");
      const runId = url.searchParams.get("run_id");
      const hits = [...rows.values()].filter(
        (row) => row.user_id === userId && (runId === null || row.run_id === runId),
      );
      return json(hits.map((row) => ({ id: row.id, memory: row.memory, metadata: row.metadata })));
    }
    if (url.pathname === "/v1/memories/" && method === "DELETE") {
      const userId = url.searchParams.get("user_id");
      const runId = url.searchParams.get("run_id");
      for (const [id, row] of rows) {
        if (row.user_id === userId && (runId === null || row.run_id === runId)) rows.delete(id);
      }
      return json({ message: "deleted" });
    }
    return json({ detail: `unexpected ${method} ${url.pathname}` }, 500);
  }) as typeof fetch;
}

/**
 * In-memory fetch mock emulating the Zep v2 surface the adapter targets:
 * graph episodes for durable tenant memory, threads for session memory.
 */
export function createZepFetchMock(): typeof fetch {
  interface Episode {
    uuid: string;
    user_id: string;
    content: string;
  }
  interface Message {
    uuid: string;
    content: string;
  }
  const episodes = new Map<string, Episode>();
  const threads = new Map<string, { user_id: string; messages: Map<string, Message> }>();
  let seq = 0;

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    if (url.pathname === "/healthz" && method === "GET") return json({ status: "ok" });

    if (url.pathname === "/api/v2/graph" && method === "POST") {
      const uuid = `e${(seq += 1)}`;
      episodes.set(uuid, { uuid, user_id: String(body.user_id), content: String(body.data) });
      return json({ uuid });
    }
    if (url.pathname === "/api/v2/graph/search" && method === "POST") {
      const tokens = String(body.query).toLowerCase().split(/\s+/).filter(Boolean);
      const hits = [...episodes.values()]
        .filter((episode) => episode.user_id === body.user_id)
        .map((episode) => ({
          uuid: episode.uuid,
          content: episode.content,
          score: tokens.filter((t) => episode.content.toLowerCase().includes(t)).length,
        }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score);
      return json({ episodes: hits });
    }
    const episodeMatch = url.pathname.match(/^\/api\/v2\/graph\/episodes\/([^/]+)$/);
    if (episodeMatch && episodeMatch[1] !== undefined && method === "GET") {
      const episode = episodes.get(episodeMatch[1]);
      return episode ? json(episode) : json({ detail: "not found" }, 404);
    }
    if (episodeMatch && episodeMatch[1] !== undefined && method === "DELETE") {
      episodes.delete(episodeMatch[1]);
      return json({ message: "deleted" });
    }
    if (url.pathname === "/api/v2/graph/episodes" && method === "GET") {
      const userId = url.searchParams.get("user_id");
      return json({ episodes: [...episodes.values()].filter((episode) => episode.user_id === userId) });
    }

    if (url.pathname === "/api/v2/threads" && method === "POST") {
      const threadId = String(body.thread_id);
      if (!threads.has(threadId)) threads.set(threadId, { user_id: String(body.user_id), messages: new Map() });
      return json({ thread_id: threadId });
    }
    const messagesMatch = url.pathname.match(/^\/api\/v2\/threads\/([^/]+)\/messages$/);
    if (messagesMatch && messagesMatch[1] !== undefined && method === "POST") {
      const thread = threads.get(messagesMatch[1]);
      if (!thread) return json({ detail: "no thread" }, 404);
      const uuids: string[] = [];
      for (const message of body.messages as Array<{ content: string }>) {
        const uuid = `t${(seq += 1)}`;
        thread.messages.set(uuid, { uuid, content: message.content });
        uuids.push(uuid);
      }
      return json({ message_uuids: uuids });
    }
    if (messagesMatch && messagesMatch[1] !== undefined && method === "GET") {
      const thread = threads.get(messagesMatch[1]);
      return json({ messages: thread ? [...thread.messages.values()] : [] });
    }
    const messageMatch = url.pathname.match(/^\/api\/v2\/threads\/([^/]+)\/messages\/([^/]+)$/);
    if (messageMatch && messageMatch[1] !== undefined && messageMatch[2] !== undefined && method === "DELETE") {
      threads.get(messageMatch[1])?.messages.delete(messageMatch[2]);
      return json({ message: "deleted" });
    }
    const threadMatch = url.pathname.match(/^\/api\/v2\/threads\/([^/]+)$/);
    if (threadMatch && threadMatch[1] !== undefined && method === "DELETE") {
      threads.delete(threadMatch[1]);
      return json({ message: "deleted" });
    }
    return json({ detail: `unexpected ${method} ${url.pathname}` }, 500);
  }) as typeof fetch;
}
