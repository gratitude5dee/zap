// Cloud sessions routes (§5.12): tenant-scoped proxies to the runtime's
// zap-agentd /v1/agents routes. The control plane mirrors metadata only.
import type { CloudRouteModule, RuntimeRow } from "../types.ts";
import type { AgentSessionRow, AgentSessionStore } from "./store.ts";

export type { AgentSessionRow, AgentSessionStore } from "./store.ts";
export { memoryAgentSessionStore } from "./store.ts";

/** transport from the control plane to a runtime's in-VM agentd */
export interface RuntimeAgentdTransport {
  request(
    runtime: RuntimeRow,
    req: { method: "GET" | "POST"; path: string; body?: unknown },
  ): Promise<{ status: number; body?: unknown; stream?: AsyncIterable<string> }>;
}

export interface SessionsModuleOptions {
  store: AgentSessionStore;
  transport: RuntimeAgentdTransport;
}

interface SessionMetaPayload {
  id: string;
  agent: string;
  alias: string;
  deploymentId: string;
  createdAt: string;
  lastActiveAt: string;
  turns: number;
}

export function createSessionsModule(options: SessionsModuleOptions): CloudRouteModule {
  return {
    name: "sessions",
    mount(app, { deps }) {
      app.post("/v1/sessions", async (c) => {
        const principal = c.get("principal");
        if (!principal) {
          return c.json({ error: { code: "UNAUTHENTICATED", message: "Send a bearer token." } }, 401);
        }
        const body = (await c.req.json().catch(() => ({}))) as {
          runtimeId?: string;
          agent?: string;
          alias?: string;
        };
        if (!body.runtimeId || !body.agent) {
          return c.json({ error: { code: "BAD_REQUEST", message: "Send runtimeId and agent." } }, 400);
        }
        const runtime = await deps.runtimes.get(body.runtimeId);
        if (!runtime || runtime.tenantId !== principal) {
          return c.json({ error: { code: "RUNTIME_NOT_FOUND", message: "No such runtime." } }, 404);
        }
        const created = await options.transport.request(runtime, {
          method: "POST",
          path: "/v1/agents/sessions",
          body: { agent: body.agent, alias: body.alias ?? "development" },
        });
        if (created.status !== 201) {
          return c.json(created.body ?? { error: { code: "SESSION_CREATE_FAILED" } }, created.status as 404);
        }
        const meta = created.body as SessionMetaPayload;
        const row: AgentSessionRow = {
          id: meta.id,
          tenantId: principal,
          runtimeId: runtime.id,
          agent: meta.agent,
          alias: meta.alias,
          deploymentId: meta.deploymentId,
          createdAt: meta.createdAt,
          lastActiveAt: meta.lastActiveAt,
          turns: meta.turns,
        };
        await options.store.insert(row);
        return c.json(row, 201);
      });

      app.get("/v1/sessions", async (c) => {
        const principal = c.get("principal");
        if (!principal) {
          return c.json({ error: { code: "UNAUTHENTICATED", message: "Send a bearer token." } }, 401);
        }
        return c.json(await options.store.list(principal));
      });

      app.get("/v1/sessions/:id", async (c) => {
        const principal = c.get("principal");
        if (!principal) {
          return c.json({ error: { code: "UNAUTHENTICATED", message: "Send a bearer token." } }, 401);
        }
        const row = await options.store.get(c.req.param("id"));
        if (!row || row.tenantId !== principal) {
          return c.json({ error: { code: "SESSION_NOT_FOUND", message: "No such session." } }, 404);
        }
        return c.json(row);
      });

      app.post("/v1/sessions/:id/turns", async (c) => {
        const principal = c.get("principal");
        if (!principal) {
          return c.json({ error: { code: "UNAUTHENTICATED", message: "Send a bearer token." } }, 401);
        }
        const row = await options.store.get(c.req.param("id"));
        if (!row || row.tenantId !== principal) {
          return c.json({ error: { code: "SESSION_NOT_FOUND", message: "No such session." } }, 404);
        }
        const runtime = await deps.runtimes.get(row.runtimeId);
        if (!runtime) {
          return c.json({ error: { code: "RUNTIME_NOT_FOUND", message: "No such runtime." } }, 404);
        }
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        const turn = await options.transport.request(runtime, {
          method: "POST",
          path: `/v1/agents/sessions/${row.id}/turns`,
          body,
        });
        if (turn.stream) {
          const encoder = new TextEncoder();
          const iterator = turn.stream[Symbol.asyncIterator]();
          const stream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              const next = await iterator.next();
              if (next.done) {
                controller.close();
                await options.store.update(row.id, {
                  turns: row.turns + 1,
                  lastActiveAt: new Date().toISOString(),
                });
                return;
              }
              controller.enqueue(encoder.encode(next.value));
            },
          });
          return new Response(stream, {
            status: 200,
            headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
          });
        }
        return c.json(turn.body ?? {}, turn.status as 200);
      });
    },
  };
}
