// /v1/agents route module over the agent host: deployments, aliases, session
// creation/pinning, SSE turns, and secret sync — through fakeAgentd.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createContext } from "@wzrdtech/zap-kernel";
import { describe, expect, it } from "vitest";
import transcodeAgent from "../../../agents/transcode/agent.ts";
import { webhook } from "../../../agents/transcode/connections.ts";
import type { AgentEvent, DeploymentManifest } from "@wzrdtech/zap-agent";
import { createAgentsRouteModule } from "../src/agentd/agents/routes.ts";
import { createAgentHost, type LoadedProject } from "../src/agentd/agents/host.ts";
import { createEnvSecretResolver } from "../src/secrets/env.ts";
import { fakeAgentd, fakePayService, fakeSandboxService } from "../src/testing.ts";

const SHA = "a".repeat(64);

function manifest(): DeploymentManifest {
  return {
    project: "zap",
    agents: {
      transcode: {
        tools: [{ name: "ffmpeg_transcode", readOnly: false, inputSchema: {} }],
        connections: [
          {
            id: "webhook",
            origin: "https://hooks.example.com",
            methods: ["POST"],
            pathPrefix: "/zap/",
            headerNames: ["Authorization"],
            sensitiveHeaderNames: ["Authorization"],
          },
        ],
        mcpServers: [],
        subagents: [],
        skills: [],
        secretsReferenced: ["WEBHOOK_TOKEN"],
      },
    },
    bundleSha: SHA,
    builtAt: "2026-01-01T00:00:00.000Z",
    pins: {},
  };
}

async function makeFixture() {
  const ctx = createContext();
  ctx.provide("pay", fakePayService({ mode: "byok" }));
  ctx.provide("llm", {
    async step() {
      return { text: "ok", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, usd: 0 } };
    },
  });
  const sandbox = fakeSandboxService();
  ctx.provide("sandbox", sandbox);
  ctx.provide("sandboxHandle", await sandbox.acquire({ provider: "fake", idempotencyKey: "agent-host" } as never));
  const secrets = createEnvSecretResolver();
  ctx.provide("secrets", secrets);

  const project: LoadedProject = {
    agents: { transcode: { agent: transcodeAgent, connections: [webhook.definition], mcpServers: [] } },
  };
  const host = createAgentHost({
    ctx,
    root: mkdtempSync(path.join(tmpdir(), "zap-agentd-")),
    loadBundle: async () => project,
  });
  const agentd = fakeAgentd();
  agentd.mount(createAgentsRouteModule(host), ctx);
  return { agentd, secrets };
}

async function collectStream(stream: AsyncIterable<string>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const chunk of stream) {
    for (const line of chunk.split("\n\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) events.push(JSON.parse(trimmed.slice(5).trim()) as AgentEvent);
    }
  }
  return events;
}

describe("agentd /v1/agents routes", () => {
  it("registers a deployment, moves an alias, and pins sessions", async () => {
    const { agentd } = await makeFixture();
    const registered = await agentd.request({
      method: "POST",
      path: "/v1/agents/deployments",
      params: {},
      query: {},
      headers: {},
      body: { manifest: manifest() },
    });
    expect(registered.status).toBe(201);

    const moved = await agentd.request({
      method: "POST",
      path: "/v1/agents/aliases/development",
      params: {},
      query: {},
      headers: {},
      body: { deploymentId: SHA, by: "test" },
    });
    expect(moved.status).toBe(200);

    const session = await agentd.request({
      method: "POST",
      path: "/v1/agents/sessions",
      params: {},
      query: {},
      headers: {},
      body: { agent: "transcode", alias: "development" },
    });
    expect(session.status).toBe(201);
    expect((session.body as { deploymentId: string }).deploymentId).toBe(SHA);
  });

  it("rejects a session for an unknown alias with 404 ALIAS_NOT_FOUND", async () => {
    const { agentd } = await makeFixture();
    const session = await agentd.request({
      method: "POST",
      path: "/v1/agents/sessions",
      params: {},
      query: {},
      headers: {},
      body: { agent: "transcode", alias: "production" },
    });
    expect(session.status).toBe(404);
    expect((session.body as { error: string }).error).toBe("ALIAS_NOT_FOUND");
  });

  it("streams turn events over SSE and syncs secrets without echoing them", async () => {
    const { agentd, secrets } = await makeFixture();
    await agentd.request({
      method: "POST",
      path: "/v1/agents/deployments",
      params: {},
      query: {},
      headers: {},
      body: { manifest: manifest() },
    });
    await agentd.request({
      method: "POST",
      path: "/v1/agents/aliases/development",
      params: {},
      query: {},
      headers: {},
      body: { deploymentId: SHA, by: "test" },
    });

    const synced = await agentd.request({
      method: "POST",
      path: "/v1/agents/secrets/sync",
      params: {},
      query: {},
      headers: {},
      body: { values: { WEBHOOK_TOKEN: "canary-agentd-route" } },
    });
    expect(synced.status).toBe(204);
    expect(JSON.stringify(synced.body ?? null)).not.toContain("canary-agentd-route");
    expect(secrets.names()).toContain("WEBHOOK_TOKEN");

    const session = await agentd.request({
      method: "POST",
      path: "/v1/agents/sessions",
      params: {},
      query: {},
      headers: {},
      body: { agent: "transcode", alias: "development" },
    });
    const sessionId = (session.body as { id: string }).id;

    const turn = await agentd.request({
      method: "POST",
      path: `/v1/agents/sessions/${sessionId}/turns`,
      params: {},
      query: {},
      headers: {},
      body: { text: "hello" },
    });
    expect(turn.status).toBe(200);
    expect(turn.stream).toBeDefined();
    const events = await collectStream(turn.stream as AsyncIterable<string>);
    expect(events.some((event) => event.type === "turn.started")).toBe(true);
    expect(events.some((event) => event.type === "render")).toBe(true);
    expect(events.some((event) => event.type === "turn.completed")).toBe(true);
    expect(JSON.stringify(events)).not.toContain("canary-agentd-route");
  });
});
