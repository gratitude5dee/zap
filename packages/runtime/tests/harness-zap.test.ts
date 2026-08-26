// harness.zap: in-process executor over a recorded LLM + fake sandbox, the
// /v1/runs route on fakeAgentd, and the caller-side http-runs driver.
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defineTool, type AnyTool, type ToolContext } from "@wzrdtech/zap-agent";
import { createContext, type Context, type RunEvent } from "@wzrdtech/zap-kernel";
import { runsRouteModule } from "../src/agentd/runs.ts";
import type { LlmStepResult } from "../src/gateway/index.ts";
import {
  HarnessError,
  createZapDriverService,
  executeStep,
  zapHarnessManifest,
  type McpClient,
  type StepCapabilities,
  type StepEvent,
} from "../src/harness/zap.ts";
import { fakeAgentd, fakeMeterService, fakePayService, fakeSandboxService, type PayerMode } from "../src/testing.ts";

interface ScriptedCall {
  text?: string;
  toolCalls?: LlmStepResult["toolCalls"];
  usage?: Partial<LlmStepResult["usage"]>;
}

function recordedLlm(script: ScriptedCall[]) {
  const calls: unknown[] = [];
  return {
    calls,
    service: {
      async step(req: unknown): Promise<LlmStepResult> {
        calls.push(req);
        const next = script.shift() ?? {};
        return {
          text: next.text ?? "",
          toolCalls: next.toolCalls ?? [],
          usage: { inputTokens: 42, outputTokens: 7, usd: 0, ...next.usage },
        };
      },
    },
  };
}

async function makeCtx(options: { payer: PayerMode; llm?: { step(req: unknown): Promise<LlmStepResult> } }): Promise<{
  ctx: Context;
  sandboxExecs: Array<{ argv: readonly string[] | string; opts?: unknown }>;
}> {
  const ctx = createContext();
  ctx.provide("pay", fakePayService({ mode: options.payer }));
  if (options.llm) ctx.provide("llm", options.llm);

  const sandboxService = fakeSandboxService();
  const handle = await sandboxService.acquire({ provider: "fake", idempotencyKey: "harness-test" } as never);
  const sandboxExecs: Array<{ argv: readonly string[] | string; opts?: unknown }> = [];
  const realExec = handle.exec.bind(handle);
  handle.exec = async (argv, opts) => {
    sandboxExecs.push({ argv, opts });
    return realExec(argv, opts);
  };
  ctx.provide("sandbox", sandboxService);
  ctx.provide("sandboxHandle", handle);
  return { ctx, sandboxExecs };
}

function toolContextFor(ctx: Context, live: boolean): Omit<ToolContext<never>, "input" | "signal"> {
  return {
    sandbox: {
      async exec(argv, opts) {
        const handle = ctx.get<{ exec(argv: unknown, opts?: unknown): Promise<never> }>("sandboxHandle")!;
        return handle.exec(argv, opts);
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
      id: "session-1",
      alias: "test",
      data: {
        async get() {
          return undefined;
        },
        async set() {},
      },
    },
    async reportProgress() {},
    live,
    log() {},
  };
}

const ffmpegTool = defineTool({
  name: "ffmpeg.preset",
  description: "Run an ffmpeg preset through the ffmpeg lane.",
  input: { type: "object" },
  estimate: () => [{ unit: "sandbox_second", qty: 3.5, sku: "ffmpeg.transcode-h264" }],
  async run(toolCtx) {
    const result = await toolCtx.sandbox.exec(["ffmpeg", "-i", "in.mp4", "out.mp4"], { lane: "ffmpeg" });
    return { exitCode: result.exitCode };
  },
}) as AnyTool;

const readOnlyTool = defineTool({
  name: "media.list",
  description: "List media.",
  input: { type: "object" },
  readOnly: true,
  async run() {
    return [];
  },
}) as AnyTool;

function caps(tools: AnyTool[], extra: Partial<StepCapabilities> = {}): StepCapabilities {
  return {
    instructions: "You transcode media.",
    model: "gateway/anthropic/claude-sonnet-4.6",
    tools: new Map(tools.map((tool) => [tool.definition.name, tool])),
    mcpServers: new Set(),
    subagents: new Map(),
    ...extra,
  };
}

function stepOpts(ctx: Context, live: boolean, events: StepEvent[], extra: Partial<Parameters<typeof executeStep>[2]> = {}) {
  return {
    signal: new AbortController().signal,
    history: [{ role: "user" as const, content: "transcode in.mp4" }],
    mcp: new Map(),
    onEvent(event: StepEvent) {
      events.push(event);
    },
    toolContext: toolContextFor(ctx, live),
    ...extra,
  };
}

describe("harness.zap executor", () => {
  it("byok + live:false: reports usage, emits tool.planned, never executes ffmpeg", async () => {
    const llm = recordedLlm([
      {
        text: "Planning the transcode.",
        toolCalls: [{ id: "call-1", name: "ffmpeg.preset", input: { preset: "transcode-h264" } }],
      },
    ]);
    const { ctx, sandboxExecs } = await makeCtx({ payer: "byok", llm: llm.service });
    const events: StepEvent[] = [];
    const result = await executeStep(ctx, caps([ffmpegTool]), stepOpts(ctx, false, events));

    expect(result.kind).toBe("final");
    expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 7, reasoningTokens: undefined, usd: 0 });
    expect(events.map((event) => event.type)).toEqual(["text.delta", "tool.planned"]);
    expect(events[1]).toMatchObject({
      tool: "ffmpeg.preset",
      estimate: [{ unit: "sandbox_second", qty: 3.5, sku: "ffmpeg.transcode-h264" }],
    });
    expect(sandboxExecs).toHaveLength(0);
  });

  it("missing payer: PAYER_MISSING before any model call, in both modes", async () => {
    for (const live of [false, true]) {
      const llm = recordedLlm([{ text: "should never run" }]);
      const { ctx } = await makeCtx({ payer: "missing", llm: llm.service });
      await expect(executeStep(ctx, caps([ffmpegTool]), stepOpts(ctx, live, []))).rejects.toMatchObject({
        code: "PAYER_MISSING",
      });
      expect(llm.calls).toHaveLength(0);
    }
  });

  it("byok + live:true: executes the ffmpeg lane through the sandbox", async () => {
    const llm = recordedLlm([
      { toolCalls: [{ id: "call-1", name: "ffmpeg.preset", input: { preset: "transcode-h264" } }] },
    ]);
    const { ctx, sandboxExecs } = await makeCtx({ payer: "byok", llm: llm.service });
    const events: StepEvent[] = [];
    const result = await executeStep(ctx, caps([ffmpegTool]), stepOpts(ctx, true, events));

    expect(result.kind).toBe("needs-render");
    expect(events.map((event) => event.type)).toEqual(["tool.call", "tool.result"]);
    expect(sandboxExecs).toHaveLength(1);
    expect(sandboxExecs[0]?.opts).toMatchObject({ lane: "ffmpeg" });
  });

  it("read-only tools execute in both modes", async () => {
    for (const live of [false, true]) {
      const llm = recordedLlm([
        { toolCalls: [{ id: "call-1", name: "media.list", input: {} }] },
      ]);
      const { ctx } = await makeCtx({ payer: "byok", llm: llm.service });
      const events: StepEvent[] = [];
      await executeStep(ctx, caps([readOnlyTool]), stepOpts(ctx, live, events));
      expect(events.map((event) => event.type), `live=${live}`).toEqual(["tool.call", "tool.result"]);
    }
  });

  it("lists and calls MCP tools through the supplied client", async () => {
    const mcpCalls: Array<{ name: string; input: unknown }> = [];
    const client: McpClient = {
      async listTools() {
        return [{ name: "notes.search", description: "Search notes.", inputSchema: { type: "object" } }];
      },
      async callTool(name, input) {
        mcpCalls.push({ name, input });
        return { hits: 2 };
      },
      async close() {},
    };
    const llm = recordedLlm([
      { toolCalls: [{ id: "call-1", name: "notes.search", input: { q: "zap" } }] },
    ]);
    const { ctx } = await makeCtx({ payer: "byok", llm: llm.service });
    const events: StepEvent[] = [];
    const result = await executeStep(
      ctx,
      caps([], { mcpServers: new Set(["notes"]) }),
      stepOpts(ctx, false, events, {
        mcp: new Map([["notes", { definition: { id: "notes" }, client: async () => client }]]),
      }),
    );
    expect(result.kind).toBe("needs-render");
    expect(mcpCalls).toEqual([{ name: "notes.search", input: { q: "zap" } }]);
    // model saw the MCP tool spec
    expect(JSON.stringify(llm.calls[0])).toContain("notes.search");
  });

  it("delegates subagent tool calls only through opts.delegate", async () => {
    const llm = recordedLlm([
      { toolCalls: [{ id: "call-1", name: "subagent:editor", input: { text: "polish" } }] },
    ]);
    const { ctx } = await makeCtx({ payer: "byok", llm: llm.service });
    const delegated: string[] = [];
    const result = await executeStep(
      ctx,
      caps([], { subagents: new Map([["editor", {}]]) }),
      stepOpts(ctx, false, [], {
        async delegate(subagentId, input) {
          delegated.push(`${subagentId}:${String(input.text)}`);
          return { text: "done", events: [] };
        },
      }),
    );
    expect(delegated).toEqual(["editor:polish"]);
    expect(result.kind).toBe("needs-render");
  });
});

describe("/v1/runs on fakeAgentd + harness.zap driver", () => {
  async function collectEvents(iterable: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
    const events: RunEvent[] = [];
    for await (const event of iterable) events.push(event);
    return events;
  }

  it("streams run.started … run.completed matching the med-plan fixture (plan-only)", async () => {
    const llm = recordedLlm([
      {
        text: "Planning the transcode.",
        toolCalls: [
          { id: "call-1", name: "ffmpeg.preset", input: { preset: "transcode-h264", inputs: ["/zap/fs/in.mp4"] } },
        ],
      },
    ]);
    const { ctx } = await makeCtx({ payer: "byok", llm: llm.service });
    const agentd = fakeAgentd();
    agentd.mount(runsRouteModule(), ctx);

    const driver = createZapDriverService({
      request: (req) => agentd.request({ ...req, headers: req.headers ?? {}, query: {} }),
    });
    expect(driver.manifest()).toEqual(zapHarnessManifest());

    const sandbox = ctx.get<never>("sandboxHandle")!;
    const handle = await driver.run(sandbox, { prompt: "transcode in.mp4", live: false, payer: "byok" });
    const events = await collectEvents(handle.events());

    const fixture = (await fs.readFile(path.join(__dirname, "fixtures", "med-plan.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as RunEvent);
    expect(events).toEqual(fixture);
  });

  it("driver relays events unchanged and settles the fake meter from completion usage", async () => {
    const llm = recordedLlm([{ text: "All done." }]);
    const { ctx } = await makeCtx({ payer: "byok", llm: llm.service });
    const agentd = fakeAgentd();
    agentd.mount(runsRouteModule(), ctx);
    const meter = fakeMeterService();

    const driver = createZapDriverService(
      { request: (req) => agentd.request({ ...req, headers: req.headers ?? {}, query: {} }) },
      meter,
    );
    const handle = await driver.run(ctx.get<never>("sandboxHandle")!, { prompt: "hello", live: false, payer: "byok" });
    const events = await collectEvents(handle.events());

    expect(events[0]).toEqual({ type: "run.started", live: false, payer: "byok" });
    expect(events.at(-1)?.type).toBe("run.completed");
    expect(meter.lines()).toEqual([{ unit: "gateway_output_token", qty: 7, usd: 0, sku: "harness.zap.run" }]);
  });

  it("reuses runs by idempotency key", async () => {
    const llm = recordedLlm([{ text: "one" }, { text: "two" }]);
    const { ctx } = await makeCtx({ payer: "byok", llm: llm.service });
    const agentd = fakeAgentd();
    agentd.mount(runsRouteModule(), ctx);
    const driver = createZapDriverService({
      request: (req) => agentd.request({ ...req, headers: req.headers ?? {}, query: {} }),
    });
    const sandbox = ctx.get<never>("sandboxHandle")!;
    const first = await driver.run(sandbox, { prompt: "hello", live: false, payer: "byok", idempotencyKey: "idem-1" });
    const second = await driver.run(sandbox, { prompt: "hello", live: false, payer: "byok", idempotencyKey: "idem-1" });
    expect(second.id).toBe(first.id);
  });

  it("run fails with PAYER_MISSING when no payer resolves", async () => {
    const llm = recordedLlm([{ text: "never" }]);
    const { ctx } = await makeCtx({ payer: "missing", llm: llm.service });
    const agentd = fakeAgentd();
    agentd.mount(runsRouteModule(), ctx);
    const driver = createZapDriverService({
      request: (req) => agentd.request({ ...req, headers: req.headers ?? {}, query: {} }),
    });
    const handle = await driver.run(ctx.get<never>("sandboxHandle")!, { prompt: "hello", live: false, payer: "byok" });
    const events = await collectEvents(handle.events());
    expect(events.at(-1)).toMatchObject({ type: "run.failed", code: "PAYER_MISSING" });
    expect(llm.calls).toHaveLength(0);
  });

  it("health() reflects /v1/health", async () => {
    const { ctx } = await makeCtx({ payer: "byok" });
    const agentd = fakeAgentd();
    agentd.mount(runsRouteModule(), ctx);
    const driver = createZapDriverService({
      request: (req) => agentd.request({ ...req, headers: req.headers ?? {}, query: {} }),
    });
    expect(await driver.health(ctx.get<never>("sandboxHandle")!)).toEqual({
      ok: true,
      checks: [{ name: "agentd", ok: true }],
    });
  });

  it("driver run surfaces non-2xx creation as RUN_FAILED", async () => {
    const driver = createZapDriverService({ request: async () => ({ status: 500 }) });
    const { ctx } = await makeCtx({ payer: "byok" });
    await expect(
      driver.run(ctx.get<never>("sandboxHandle")!, { prompt: "x", live: false, payer: "byok" }),
    ).rejects.toBeInstanceOf(HarnessError);
  });
});
