// In-VM POST /v1/runs + SSE: executeStep in a loop with a static capability
// set, wrapped in run.started … run.completed | run.failed. The caller-side
// harness.zap driver is the http-runs client of this route (§5.6).
import type { AnyTool, ToolContext, TurnMessage } from "@wzrdtech/zap-agent";
import { defineTool } from "@wzrdtech/zap-agent";
import type { Context, RunEvent } from "@wzrdtech/zap-kernel";
import type { LaneExecutor, SandboxHandle } from "@wzrdtech/zap-sandbox";
import { getFfmpegPreset, listFfmpegPresets } from "../ffmpeg/presets.ts";
import {
  executeStep,
  resolvePayerMode,
  type PayStatusService,
  type StepCapabilities,
  type StepEvent,
  type TokenUsage,
} from "../harness/zap.ts";
import type { MediaFs } from "../mediafs/index.ts";
import type { AgentdApp, AgentdRequest, AgentdResponse, AgentdRouteModule } from "./routes.ts";

interface RunRecord {
  id: string;
  events: RunEvent[];
  done: boolean;
  waiters: Array<() => void>;
}

function pushEvent(run: RunRecord, event: RunEvent): void {
  run.events.push(event);
  for (const waiter of run.waiters.splice(0)) waiter();
}

function buildStaticTools(ctx: Context): Map<string, AnyTool> {
  const tools = new Map<string, AnyTool>();

  tools.set(
    "fs.read",
    defineTool({
      name: "fs.read",
      description: "Read a file from the runtime filesystem under /zap/fs.",
      input: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      readOnly: true,
      async run(toolCtx) {
        const bytes = await toolCtx.fs.read(String((toolCtx.input as { path?: string }).path ?? ""));
        return bytes === null ? null : Buffer.from(bytes).toString("utf8");
      },
    }) as AnyTool,
  );

  tools.set(
    "media.list",
    defineTool({
      name: "media.list",
      description: "List media objects in the runtime media filesystem.",
      input: { type: "object", properties: { kind: { type: "string" } } },
      readOnly: true,
      async run(toolCtx) {
        const mediafs = ctx.get<MediaFs>("mediafs");
        if (!mediafs) return [];
        const sidecars: unknown[] = [];
        for await (const sidecar of mediafs.list()) sidecars.push(sidecar);
        return sidecars;
      },
    }) as AnyTool,
  );

  tools.set(
    "ffmpeg.preset",
    defineTool({
      name: "ffmpeg.preset",
      description: "Run an ffmpeg preset through the ffmpeg lane.",
      input: {
        type: "object",
        properties: {
          preset: { type: "string", enum: listFfmpegPresets().map((preset) => preset.id) },
          inputs: { type: "array", items: { type: "string" } },
        },
        required: ["preset", "inputs"],
      },
      estimate(input) {
        const preset = getFfmpegPreset(String(input.preset));
        const cpuSeconds = preset?.estimateCpuSeconds({ durationS: 1 }) ?? 1;
        return [{ unit: "sandbox_second", qty: cpuSeconds, sku: `ffmpeg.${String(input.preset)}` }];
      },
      async run(toolCtx) {
        const input = toolCtx.input as { preset: string; inputs: string[] };
        const preset = getFfmpegPreset(input.preset);
        if (!preset) throw new Error(`Unknown ffmpeg preset ${input.preset}.`);
        const result = await toolCtx.sandbox.exec(preset.argv(input.inputs), { lane: "ffmpeg" });
        return { exitCode: result.exitCode, stdout: result.stdout };
      },
    }) as AnyTool,
  );

  const lane = ctx.get<LaneExecutor>("lanes");
  if (lane) {
    tools.set(
      "lane.run",
      defineTool({
        name: "lane.run",
        description: "Run an argv in an isolated execution lane.",
        input: {
          type: "object",
          properties: { lane: { type: "string" }, argv: { type: "array", items: { type: "string" } } },
          required: ["lane", "argv"],
        },
        async run(toolCtx) {
          const input = toolCtx.input as { lane: string; argv: string[] };
          const result = await lane.run({ argv: input.argv, lane: input.lane as never });
          return { exitCode: result.exitCode, isolation: result.isolation, stdout: result.stdout };
        },
      }) as AnyTool,
    );
  }

  return tools;
}

function buildToolContext(ctx: Context, live: boolean, runId: string): Omit<ToolContext<never>, "input" | "signal"> {
  const sandbox = ctx.get<SandboxHandle>("sandboxHandle");
  return {
    sandbox: {
      async exec(argv, opts) {
        if (!sandbox) throw new Error("No sandbox handle is registered for this runtime.");
        return sandbox.exec(argv, opts);
      },
    },
    fs: {
      async read(path) {
        return sandbox?.fs.read(path) ?? null;
      },
      async write(path, bytes) {
        await sandbox?.fs.write(path, typeof bytes === "string" ? Buffer.from(bytes) : bytes);
      },
      async readdir(path) {
        const entries = (await sandbox?.fs.readdir?.(path)) ?? [];
        return entries.map((entry) => entry.name);
      },
    },
    mediafs: ctx.get<MediaFs>("mediafs"),
    connections: {},
    session: {
      id: runId,
      alias: "run",
      data: (() => {
        const data = new Map<string, unknown>();
        return {
          async get<T = unknown>(key: string) {
            return data.get(key) as T | undefined;
          },
          async set(key: string, value: unknown) {
            data.set(key, value);
          },
        };
      })(),
    },
    async reportProgress() {
      // progress is surfaced through run events
    },
    live,
    log() {
      // redacted; run events are the public record
    },
  };
}

async function executeRun(ctx: Context, run: RunRecord, body: { prompt: string; live?: boolean; payer?: string }): Promise<void> {
  const live = body.live === true;
  try {
    const payer = await resolvePayerMode(ctx.get<PayStatusService>("pay"));
    pushEvent(run, { type: "run.started", live, payer });

    const caps: StepCapabilities = {
      instructions: body.prompt,
      model: "gateway/anthropic/claude-sonnet-4.6",
      tools: buildStaticTools(ctx),
      mcpServers: new Set<string>(),
      subagents: new Map(),
    };

    const controller = new AbortController();
    const history: TurnMessage[] = [{ role: "user", content: body.prompt }];
    const total: TokenUsage = { inputTokens: 0, outputTokens: 0, usd: 0 };
    const lines: unknown[] = [];

    for (;;) {
      const result = await executeStep(ctx, caps, {
        signal: controller.signal,
        history,
        mcp: new Map(),
        onEvent(event: StepEvent) {
          pushEvent(run, event);
        },
        toolContext: buildToolContext(ctx, live, run.id),
      });
      total.inputTokens += result.usage.inputTokens;
      total.outputTokens += result.usage.outputTokens;
      total.usd += result.usage.usd;
      if (result.kind === "final") break;
      history.push(...result.messages);
    }

    pushEvent(run, { type: "run.completed", usage: { tokens: total, lines } });
  } catch (error) {
    const code = (error as { code?: string }).code ?? "RUN_FAILED";
    const remediation = (error as { remediation?: string }).remediation;
    pushEvent(run, { type: "run.failed", code, remediation });
  } finally {
    run.done = true;
    for (const waiter of run.waiters.splice(0)) waiter();
  }
}

async function* sseStream(run: RunRecord): AsyncIterable<string> {
  let cursor = 0;
  for (;;) {
    while (cursor < run.events.length) {
      yield `data: ${JSON.stringify(run.events[cursor])}\n\n`;
      cursor += 1;
    }
    if (run.done) return;
    await new Promise<void>((resolve) => run.waiters.push(resolve));
  }
}

/** zap-agentd /v1/runs route module on the in-VM executor (harness.zap, §5.6). */
export function runsRouteModule(): AgentdRouteModule {
  const runs = new Map<string, RunRecord>();
  const byIdempotencyKey = new Map<string, string>();
  let counter = 0;

  return {
    prefix: "/v1",
    mount(app: AgentdApp, ctx: Context) {
      app.route("POST", "/runs", (req: AgentdRequest): AgentdResponse => {
        const body = (req.body ?? {}) as { prompt?: string; live?: boolean; payer?: string };
        if (!body.prompt) {
          return { status: 400, body: { error: "PROMPT_REQUIRED" } };
        }
        const idempotencyKey = req.headers["idempotency-key"];
        if (idempotencyKey !== undefined) {
          const existing = byIdempotencyKey.get(idempotencyKey);
          if (existing !== undefined) return { status: 200, body: { id: existing, status: "accepted" } };
        }
        counter += 1;
        const id = `run-${counter}`;
        const run: RunRecord = { id, events: [], done: false, waiters: [] };
        runs.set(id, run);
        if (idempotencyKey !== undefined) byIdempotencyKey.set(idempotencyKey, id);
        void executeRun(ctx, run, { prompt: body.prompt, live: body.live, payer: body.payer });
        return { status: 201, body: { id, status: "accepted" } };
      });

      app.route("GET", "/runs/:id/events", (req: AgentdRequest): AgentdResponse => {
        const run = runs.get(req.params.id ?? "");
        if (!run) return { status: 404, body: { error: "RUN_NOT_FOUND" } };
        return {
          status: 200,
          headers: { "content-type": "text/event-stream" },
          stream: sseStream(run),
        };
      });

      app.route("GET", "/health", (): AgentdResponse => ({ status: 200, body: { ok: true } }));

      return () => {
        runs.clear();
        byIdempotencyKey.clear();
      };
    },
  };
}
