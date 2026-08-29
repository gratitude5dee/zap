// Z11 hardening: secret values must never appear in prompts, events, logs,
// manifests, or --json surfaces. The gateway owns provider keys — a resolved
// key travels only in the provider request header, never through prompts,
// events, or emitted logs.
import { afterEach, describe, expect, it } from "vitest";
import { defineConnection, defineTool, bearer, useSecret, type AnyTool, type ToolContext } from "@wzrdtech/zap-agent";
import { createContext, type Context } from "@wzrdtech/zap-kernel";
import { registerSecret, resetRedaction, scrub } from "../../src/auth/redact.ts";
import { createAgentConnections } from "../../src/connections/fetch.ts";
import { enableSamMesh } from "../../src/connectivity/sam-mesh.ts";
import { enableTailscale } from "../../src/connectivity/tailscale.ts";
import type { ConnectivityBox } from "../../src/connectivity/types.ts";
import { createGatewayService, type LlmStepResult } from "../../src/gateway/index.ts";
import { executeStep, zapHarnessManifest, type StepCapabilities, type StepEvent } from "../../src/harness/zap.ts";
import { createRedactingLog, redact, redactDeep, REDACTED } from "../../src/redact.ts";
import { createEnvSecretResolver } from "../../src/secrets/env.ts";
import { fakePayService } from "../../src/testing.ts";

const PROVIDER_KEY = "sk-canary0secret0provider0key000";
const HOSTED_TOKEN = "hosted-canary-token-77aa88bb";
const RUNTIME_TOKEN = "rt_live_canary0000000000000000";

afterEach(() => resetRedaction());

describe("log scrubber canaries", () => {
  it("redact strips every canary class", () => {
    const line = redact(
      [
        `provider key ${PROVIDER_KEY}`,
        `hosted url https://runtime.example.com/view?_token=${HOSTED_TOKEN}`,
        `RUNTIME_TOKEN=${RUNTIME_TOKEN}`,
        `authorization: Bearer ${RUNTIME_TOKEN}`,
        "box key box_live_abcdefgh12345678",
      ].join(" | "),
    );
    for (const canary of [PROVIDER_KEY, HOSTED_TOKEN, RUNTIME_TOKEN, "box_live_abcdefgh12345678"]) {
      expect(line).not.toContain(canary);
    }
    expect(line).toContain(REDACTED);
  });

  it("redactDeep scrubs every string leaf of a --json payload", () => {
    const payload = redactDeep({
      runs: [{ log: `key ${PROVIDER_KEY}`, nested: { url: `https://x.dev/a?_token=${HOSTED_TOKEN}` } }],
    });
    const text = JSON.stringify(payload);
    expect(text).not.toContain(PROVIDER_KEY);
    expect(text).not.toContain(HOSTED_TOKEN);
  });

  it("createRedactingLog never emits a registered canary", () => {
    const lines: string[] = [];
    const { log, buffer } = createRedactingLog((line) => lines.push(line));
    log(`booting with RUNTIME_TOKEN=${RUNTIME_TOKEN} and ${PROVIDER_KEY}`);
    log(`hosted https://foo.dev/desktop?stream=1&_token=${HOSTED_TOKEN}`);
    const joined = lines.join("\n") + buffer.join("\n");
    expect(joined).not.toContain(RUNTIME_TOKEN);
    expect(joined).not.toContain(PROVIDER_KEY);
    expect(joined).not.toContain(HOSTED_TOKEN);
  });

  it("auth scrub redacts explicitly registered secrets of any shape", () => {
    const odd = "plain-looking-secret-with-no-prefix";
    registerSecret(odd);
    expect(scrub(`resolved ${odd} for tenant`)).not.toContain(odd);
  });
});

describe("connectivity join credentials never leak", () => {
  const AUTH_KEY = "tskey-auth-canary0000000000000000";
  const BOOTSTRAP = "bt-canary-000000000000111111";
  const INVITE = "mesh-invite-canary-2222222222";

  it("redact strips tailnet and mesh join credentials", () => {
    const line = redact(
      [
        `tailscale up --auth-key=${AUTH_KEY}`,
        `sam-node join --bootstrap-token ${BOOTSTRAP}`,
        `mesh-llm serve --join ${INVITE}`,
        `ZAP_TAILSCALE_AUTH_KEY=${AUTH_KEY}`,
      ].join(" | "),
    );
    for (const canary of [AUTH_KEY, BOOTSTRAP, INVITE]) expect(line).not.toContain(canary);
  });

  it("enable() registers the credential so --json payloads and logs are scrubbed", async () => {
    const commands: string[] = [];
    const files: Array<{ content: string; path: string }> = [];
    const box: ConnectivityBox = {
      async exec(command: string) {
        commands.push(command);
        return { exitCode: 0, stderr: "", stdout: "" };
      },
      async writeFile(path: string, content: string) {
        files.push({ content, path });
      },
    };
    await enableTailscale(box, { authKey: AUTH_KEY });
    await enableSamMesh(box, {
      bootstrapToken: BOOTSTRAP,
      controlPlaneUrl: "https://mesh.owner.example",
      meshInviteToken: INVITE,
    });

    // The credential reaches the box as a 0600 file, never as an argument.
    expect(files.some((file) => file.content === AUTH_KEY)).toBe(true);
    for (const command of commands) {
      for (const canary of [AUTH_KEY, BOOTSTRAP, INVITE]) expect(command).not.toContain(canary);
    }
    // …and once registered, any accidental echo is scrubbed everywhere.
    for (const canary of [AUTH_KEY, BOOTSTRAP, INVITE]) {
      expect(scrub(`leaked ${canary}`)).not.toContain(canary);
      expect(JSON.stringify(redactDeep({ detail: `leaked ${canary}` }))).not.toContain(canary);
    }
  });
});

describe("gateway owns provider keys", () => {
  it("the resolved key reaches only the provider request header", async () => {
    const requests: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
    const gateway = createGatewayService({
      resolveKey: () => PROVIDER_KEY,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: String(url),
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: String(init?.body ?? ""),
        });
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch,
    });
    const service = gateway.llm("openrouter", { model: "anthropic/claude-sonnet-4.6" });
    const result = await service.step({ messages: [{ role: "user", content: "hello" }] });
    expect(result.text).toBe("ok");
    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers.Authorization).toContain(PROVIDER_KEY);
    // never in the prompt body sent to the provider
    expect(requests[0]!.body).not.toContain(PROVIDER_KEY);
  });

  it("KEY_UNAVAILABLE fails closed without a provider fetch and never mentions env vars", async () => {
    let fetched = 0;
    const gateway = createGatewayService({
      fetchImpl: (async () => {
        fetched += 1;
        return new Response("{}");
      }) as typeof fetch,
    });
    const service = gateway.llm("openrouter", { model: "anthropic/claude-sonnet-4.6" });
    await expect(service.step({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({
      code: "KEY_UNAVAILABLE",
    });
    expect(fetched).toBe(0);
  });

  it("the harness manifest carries no key material fields", () => {
    const text = JSON.stringify(zapHarnessManifest());
    expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
    expect(text).not.toMatch(/(api[_-]?key|secret)["']?\s*[:=]/i);
  });
});

describe("connection secrets stay out of events and logs", () => {
  it("a connection bearer secret is attached to the outbound request only", async () => {
    const definition = defineConnection({
      id: "svc",
      origin: "https://api.example.com",
      methods: ["GET"],
      pathPrefix: "/v1",
      headers: { Authorization: bearer(useSecret("SVC_TOKEN")) },
      sensitiveHeaders: ["Authorization"],
    }).definition;
    const resolver = createEnvSecretResolver({ SVC_TOKEN: HOSTED_TOKEN });
    const entry = {
      tools: [],
      connections: [
        {
          id: "svc",
          origin: "https://api.example.com",
          methods: ["GET"],
          pathPrefix: "/v1",
          headerNames: ["Authorization"],
          sensitiveHeaderNames: ["Authorization"],
        },
      ],
      mcpServers: [],
      subagents: [],
      skills: [],
      secretsReferenced: ["SVC_TOKEN"],
    };
    const scope = { project: "security", agentId: "agent", alias: "main" };
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const connections = createAgentConnections([definition], {
      entry,
      scope,
      resolver,
      fetchImpl: async (url, init) => {
        seen.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      },
    });
    await connections.svc!.fetch("/v1/things", { method: "GET" });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers.Authorization).toBe(`Bearer ${HOSTED_TOKEN}`);
  });

  it("an undeclared secret fails closed with SECRET_SCOPE_DENIED and no outbound request", async () => {
    const definition = defineConnection({
      id: "svc",
      origin: "https://api.example.com",
      methods: ["GET"],
      pathPrefix: "/v1",
      headers: { Authorization: bearer(useSecret("SVC_TOKEN")) },
    }).definition;
    const resolver = createEnvSecretResolver({ SVC_TOKEN: HOSTED_TOKEN });
    let fetched = 0;
    const connections = createAgentConnections([definition], {
      entry: undefined,
      scope: { project: "security", agentId: "stranger", alias: "main" },
      resolver,
      fetchImpl: async () => {
        fetched += 1;
        return new Response("{}");
      },
    });
    await expect(connections.svc!.fetch("/v1/things", { method: "GET" })).rejects.toMatchObject({
      code: "SECRET_SCOPE_DENIED",
    });
    expect(fetched).toBe(0);
  });
});

describe("secrets never enter prompts or run events", () => {
  const noopTool = defineTool({
    name: "noop",
    description: "No-op.",
    input: { type: "object" },
    readOnly: true,
    async run() {
      return "ok";
    },
  }) as AnyTool;

  function toolContext(): Omit<ToolContext<never>, "input" | "signal"> {
    return {
      sandbox: {
        async exec() {
          throw new Error("unused");
        },
      },
      fs: {
        async read() {
          return null;
        },
        async write() {},
        async readdir() {
          return [];
        },
      },
      connections: {},
      session: {
        id: "s",
        alias: "s",
        data: {
          async get() {
            return undefined;
          },
          async set() {},
        },
      },
      async reportProgress() {},
      live: false,
      log() {},
    };
  }

  it("the executor forwards instructions/history only — no key material is injected", async () => {
    const ctx: Context = createContext();
    ctx.provide("pay", fakePayService({ mode: "byok" }));
    const prompts: string[] = [];
    ctx.provide("llm", {
      async step(req: { messages: Array<{ content: string }> }): Promise<LlmStepResult> {
        prompts.push(req.messages.map((m) => m.content).join("\n"));
        return { text: "done", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, usd: 0 } };
      },
    });
    process.env.SECURITY_CANARY_KEY = PROVIDER_KEY;
    try {
      const caps: StepCapabilities = {
        instructions: "You are a Zap CPU agent. Plan first.",
        model: "gateway/anthropic/claude-sonnet-4.6",
        tools: new Map([[noopTool.definition.name, noopTool]]),
        mcpServers: new Set(),
        subagents: new Map(),
      };
      const events: StepEvent[] = [];
      await executeStep(ctx, caps, {
        signal: new AbortController().signal,
        history: [{ role: "user", content: "transcode a.mp4" }],
        mcp: new Map(),
        onEvent(event) {
          events.push(event);
        },
        toolContext: toolContext(),
      });
      const surface = prompts.join("\n") + JSON.stringify(events);
      expect(surface).not.toContain(PROVIDER_KEY);
      expect(surface).not.toContain(RUNTIME_TOKEN);
    } finally {
      delete process.env.SECURITY_CANARY_KEY;
    }
  });
});
