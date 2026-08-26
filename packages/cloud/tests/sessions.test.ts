// Cloud /v1/sessions: tenant-scoped proxy to the runtime's agentd; the
// control plane mirrors metadata only — no turns, messages, or content.
import { describe, expect, it } from "vitest";
import { createSessionsModule, memoryAgentSessionStore, type RuntimeAgentdTransport } from "../src/sessions/index.ts";
import { createTestCloud, type TestCloud } from "../src/testing.ts";

const SHA = "b".repeat(64);

function fakeTransport(): { transport: RuntimeAgentdTransport; requests: Array<{ path: string; body?: unknown }> } {
  const requests: Array<{ path: string; body?: unknown }> = [];
  const transport: RuntimeAgentdTransport = {
    async request(_runtime, req) {
      requests.push({ path: req.path, body: req.body });
      if (req.method === "POST" && req.path === "/v1/agents/sessions") {
        const body = req.body as { agent: string; alias: string };
        if (body.alias === "production") {
          return { status: 404, body: { error: "ALIAS_NOT_FOUND" } };
        }
        const now = new Date().toISOString();
        return {
          status: 201,
          body: {
            id: "sess_1",
            agent: body.agent,
            alias: body.alias,
            deploymentId: SHA,
            createdAt: now,
            lastActiveAt: now,
            turns: 0,
          },
        };
      }
      if (req.method === "POST" && req.path.endsWith("/turns")) {
        return {
          status: 200,
          stream: (async function* stream() {
            yield `data: ${JSON.stringify({ type: "turn.started", sessionId: "sess_1", turn: 1, live: false, payer: "byok" })}\n\n`;
            yield `data: ${JSON.stringify({ type: "turn.completed", sessionId: "sess_1", turn: 1, text: "ok", usage: {} })}\n\n`;
          })(),
        };
      }
      return { status: 404, body: { error: "NOT_FOUND" } };
    },
  };
  return { transport, requests };
}

function makeCloud(): { cloud: TestCloud; requests: Array<{ path: string; body?: unknown }> } {
  const { transport, requests } = fakeTransport();
  const store = memoryAgentSessionStore();
  const cloud = createTestCloud({
    adapter: "vercel",
    modules: [createSessionsModule({ store, transport })],
  });
  return { cloud, requests };
}

async function makeRuntime(cloud: TestCloud, token = "token-alice"): Promise<string> {
  const res = await cloud.app.request("/v1/runtimes", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ weight: "light", provider: "box" }),
  });
  const body = (await res.json()) as { id: string };
  return body.id;
}

describe("cloud /v1/sessions", () => {
  it("creates a session on the tenant's runtime and mirrors only metadata", async () => {
    const { cloud } = makeCloud();
    const runtimeId = await makeRuntime(cloud);
    const created = await cloud.app.request("/v1/sessions", {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ runtimeId, agent: "transcode" }),
    });
    expect(created.status).toBe(201);
    const row = (await created.json()) as { id: string; deploymentId: string; agent: string };
    expect(row.deploymentId).toBe(SHA);
    expect(row.agent).toBe("transcode");
    expect(JSON.stringify(row)).not.toContain("messages");

    const listed = await cloud.app.request("/v1/sessions", {
      headers: { authorization: "Bearer token-alice" },
    });
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as unknown[]).length).toBe(1);
  });

  it("denies access to another tenant's runtime and sessions", async () => {
    const { cloud } = makeCloud();
    const runtimeId = await makeRuntime(cloud);
    const stranger = await cloud.app.request("/v1/sessions", {
      method: "POST",
      headers: { authorization: "Bearer token-mallory", "content-type": "application/json" },
      body: JSON.stringify({ runtimeId, agent: "transcode" }),
    });
    expect(stranger.status).toBe(404);

    const created = await cloud.app.request("/v1/sessions", {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ runtimeId, agent: "transcode" }),
    });
    const row = (await created.json()) as { id: string };
    const denied = await cloud.app.request(`/v1/sessions/${row.id}`, {
      headers: { authorization: "Bearer token-mallory" },
    });
    expect(denied.status).toBe(404);
  });

  it("propagates ALIAS_NOT_FOUND from the runtime", async () => {
    const { cloud } = makeCloud();
    const runtimeId = await makeRuntime(cloud);
    const res = await cloud.app.request("/v1/sessions", {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ runtimeId, agent: "transcode", alias: "production" }),
    });
    expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).toContain("ALIAS_NOT_FOUND");
  });

  it("streams turn events over SSE", async () => {
    const { cloud } = makeCloud();
    const runtimeId = await makeRuntime(cloud);
    const created = await cloud.app.request("/v1/sessions", {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ runtimeId, agent: "transcode" }),
    });
    const row = (await created.json()) as { id: string };
    const turn = await cloud.app.request(`/v1/sessions/${row.id}/turns`, {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(turn.status).toBe(200);
    expect(turn.headers.get("content-type")).toContain("text/event-stream");
    const payload = await turn.text();
    expect(payload).toContain("turn.started");
    expect(payload).toContain("turn.completed");
  });
});
