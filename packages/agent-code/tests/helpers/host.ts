// Shared harness for agent-code host tests: an in-process agent host over the
// fake sandbox, a recorded LLM, and the canonical agents loaded in-memory.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createContext, type Context } from "@wzrdtech/zap-kernel";
import type { LlmStepResult } from "../../../runtime/src/gateway/index.ts";
import { createAgentHost, type AgentHost, type LoadedProject } from "../../../runtime/src/agentd/agents/host.ts";
import { createEnvSecretResolver } from "../../../runtime/src/secrets/env.ts";
import { fakePayService, fakeSandboxService, type PayerMode } from "../../../runtime/src/testing.ts";
import type { DeploymentManifest } from "../../src/index.ts";
import transcodeAgent from "../../../../agents/transcode/agent.ts";
import { webhook as transcodeWebhook } from "../../../../agents/transcode/connections.ts";
import researcherAgent from "../../../../agents/researcher/agent.ts";
import { webhook as researcherWebhook, context7 } from "../../../../agents/researcher/connections.ts";

export interface ScriptedCall {
  text?: string;
  toolCalls?: LlmStepResult["toolCalls"];
}

export function recordedLlm(script: ScriptedCall[]): {
  calls: unknown[];
  service: { step(req: unknown): Promise<LlmStepResult> };
} {
  const calls: unknown[] = [];
  return {
    calls,
    service: {
      async step(req: unknown): Promise<LlmStepResult> {
        calls.push(req);
        const next = script.shift() ?? {};
        return {
          text: next.text ?? "done",
          toolCalls: next.toolCalls ?? [],
          usage: { inputTokens: 10, outputTokens: 5, usd: 0 },
        };
      },
    },
  };
}

export function canonicalManifest(): DeploymentManifest {
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
        subagents: ["researcher"],
        skills: [],
        secretsReferenced: ["WEBHOOK_TOKEN"],
      },
      researcher: {
        tools: [
          { name: "ffprobe", readOnly: true, inputSchema: {} },
          { name: "notify", readOnly: false, inputSchema: {} },
        ],
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
        mcpServers: ["context7"],
        subagents: [],
        skills: ["summarize"],
        secretsReferenced: ["WEBHOOK_TOKEN", "CONTEXT7_API_KEY"],
      },
    },
    bundleSha: "0".repeat(64),
    builtAt: "2026-01-01T00:00:00.000Z",
    pins: {},
  };
}

export function canonicalProject(): LoadedProject {
  return {
    agents: {
      transcode: {
        agent: transcodeAgent,
        connections: [transcodeWebhook.definition],
        mcpServers: [],
      },
      researcher: {
        agent: researcherAgent,
        connections: [researcherWebhook.definition],
        mcpServers: [context7.definition],
      },
    },
  };
}

export interface HostFixture {
  host: AgentHost;
  ctx: Context;
  root: string;
  sandboxExecs: Array<{ argv: readonly string[] | string }>;
  outbound: Array<{ url: string; headers: Record<string, string> }>;
  logs: string[];
  secretResolver: ReturnType<typeof createEnvSecretResolver>;
}

export async function makeHost(options: {
  payer: PayerMode;
  llm?: { step(req: unknown): Promise<LlmStepResult> };
  secrets?: Record<string, string>;
  manifest?: DeploymentManifest;
  project?: LoadedProject;
}): Promise<HostFixture> {
  const ctx = createContext();
  ctx.provide("pay", fakePayService({ mode: options.payer }));
  if (options.llm) ctx.provide("llm", options.llm);

  const sandboxService = fakeSandboxService();
  const handle = await sandboxService.acquire({ provider: "fake", idempotencyKey: "agent-host-test" } as never);
  const sandboxExecs: Array<{ argv: readonly string[] | string }> = [];
  const realExec = handle.exec.bind(handle);
  handle.exec = async (argv, opts) => {
    sandboxExecs.push({ argv });
    return realExec(argv, opts);
  };
  ctx.provide("sandbox", sandboxService);
  ctx.provide("sandboxHandle", handle);

  const secretResolver = createEnvSecretResolver();
  if (options.secrets) secretResolver.sync(options.secrets);
  ctx.provide("secrets", secretResolver);

  const outbound: Array<{ url: string; headers: Record<string, string> }> = [];
  const logs: string[] = [];
  const root = mkdtempSync(path.join(tmpdir(), "zap-host-"));
  const manifest = options.manifest ?? canonicalManifest();
  const project = options.project ?? canonicalProject();
  const host = createAgentHost({
    ctx,
    root,
    loadBundle: async () => project,
    log: (line) => logs.push(line),
    fetchImpl: async (url, init) => {
      outbound.push({ url, headers: { ...((init?.headers as Record<string, string>) ?? {}) } });
      return new Response("ok", { status: 200 });
    },
  });
  await host.registerDeployment({ manifest });
  await host.moveAlias("development", manifest.bundleSha, "test-setup");
  return { host, ctx, root, sandboxExecs, outbound, logs, secretResolver };
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}
