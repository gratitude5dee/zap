// Shared run-adapter plumbing for the §5.6 harness contract. Every third-party
// harness driver normalizes its native wire protocol (http-runs SSE,
// openai-compat chunks, cli-exec JSONL, rpc-jsonl, ws-jsonrpc frames) into the
// kernel RunEvent shape, redacted (C6/C24), with run.started prepended by the
// caller side so live/payer are always explicit.
import type { RunEvent } from "@wzrdtech/zap-kernel";
import type { SandboxHandle } from "@wzrdtech/zap-sandbox";
import { redactDeep } from "../redact.ts";
import { HarnessError, type HarnessManifest, type HarnessService, type RunHandle, type RunInput } from "./zap.ts";

export interface HarnessTransport {
  request?(req: {
    method: "GET" | "POST";
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<{ status: number; body?: unknown; stream?: AsyncIterable<string> }>;
  exec?(argv: readonly string[], opts?: { stdin?: string }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  ws?(path: string, payload: unknown): Promise<AsyncIterable<string>>;
}

const RUN_EVENT_TYPES = new Set<RunEvent["type"]>([
  "run.started",
  "text.delta",
  "tool.call",
  "tool.result",
  "tool.planned",
  "approval.required",
  "run.completed",
  "run.failed",
]);

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Accept a frame that is already RunEvent-shaped; drop anything else. */
export function toRunEvent(frame: unknown): RunEvent | undefined {
  if (typeof frame !== "object" || frame === null) return undefined;
  const type = (frame as { type?: unknown }).type;
  if (typeof type !== "string" || !RUN_EVENT_TYPES.has(type as RunEvent["type"])) return undefined;
  return redactDeep(stripUndefined(frame as RunEvent));
}

export function parseSseData(payload: string): unknown[] {
  return payload
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data:"))
    .map((chunk) => JSON.parse(chunk.slice("data:".length).trim()) as unknown);
}

async function* streamFrames(stream: AsyncIterable<string>): AsyncIterable<unknown> {
  for await (const chunk of stream) {
    for (const frame of parseSseData(chunk)) yield frame;
  }
}

/** http-runs / rpc-jsonl / ws-jsonrpc payloads that are already RunEvents. */
export function normalizeRunEventFrames(frames: AsyncIterable<unknown>): AsyncIterable<RunEvent> {
  return (async function* () {
    for await (const frame of frames) {
      const event = toRunEvent(frame);
      if (event) yield event;
    }
  })();
}

interface OpenAiChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      role?: string;
      tool_call_id?: string;
      tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** openai-compat chat.completions chunks → RunEvents. */
export function normalizeOpenAiChunks(frames: AsyncIterable<unknown>): AsyncIterable<RunEvent> {
  return (async function* () {
    const toolNames = new Map<string, string>();
    for await (const raw of frames) {
      const chunk = raw as OpenAiChunk;
      for (const choice of chunk.choices ?? []) {
        const delta = choice.delta ?? {};
        for (const call of delta.tool_calls ?? []) {
          const name = call.function?.name ?? "tool";
          if (call.id) toolNames.set(call.id, name);
          let input: unknown = {};
          try {
            input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
          } catch {
            input = { arguments: call.function?.arguments };
          }
          yield redactDeep<RunEvent>({ type: "tool.call", tool: name, input });
        }
        if (delta.role === "tool" && typeof delta.content === "string") {
          const tool = (delta.tool_call_id && toolNames.get(delta.tool_call_id)) ?? "tool";
          let output: unknown = delta.content;
          try {
            output = JSON.parse(delta.content);
          } catch {
            /* plain text tool output */
          }
          yield redactDeep<RunEvent>({ type: "tool.result", tool, output });
          continue;
        }
        if (typeof delta.content === "string" && delta.role !== "tool") {
          yield redactDeep<RunEvent>({ type: "text.delta", text: delta.content });
        }
        if (choice.finish_reason === "stop") {
          yield redactDeep<RunEvent>({
            type: "run.completed",
            usage: {
              tokens: {
                inputTokens: chunk.usage?.prompt_tokens ?? 0,
                outputTokens: chunk.usage?.completion_tokens ?? 0,
                usd: 0,
              },
            },
          });
        }
      }
    }
  })();
}

/** JSONL lines (cli-exec stdout, rpc-jsonl) → RunEvents. */
export function normalizeJsonlLines(stdout: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let frame: unknown;
    try {
      frame = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const event = toRunEvent(frame);
    if (event) events.push(event);
  }
  return events;
}

/** ws-jsonrpc frames ({method:"run.event", params}) → RunEvents. */
export function normalizeJsonRpcFrames(frames: AsyncIterable<string>): AsyncIterable<RunEvent> {
  return (async function* () {
    for await (const raw of frames) {
      let frame: unknown;
      try {
        frame = JSON.parse(raw);
      } catch {
        continue;
      }
      const method = (frame as { method?: unknown }).method;
      if (method !== "run.event") continue;
      const event = toRunEvent((frame as { params?: unknown }).params);
      if (event) yield event;
    }
  })();
}

export interface HarnessDriverOptions {
  manifest: () => HarnessManifest;
  transport: HarnessTransport;
  http?: { createPath: string; eventsPath(runId: string): string; healthPath?: string };
  openai?: { path: string };
  cli?: { argv(input: RunInput): string[] };
  ws?: { path(input: RunInput): string; payload(input: RunInput): unknown };
  bakeScript?: string;
}

function requireTransport<K extends keyof HarnessTransport>(
  transport: HarnessTransport,
  key: K,
  id: string,
): NonNullable<HarnessTransport[K]> {
  const value = transport[key];
  if (!value) {
    throw new HarnessError({
      code: "HARNESS_UNAVAILABLE",
      message: `harness.${id} requires a ${key} transport.`,
    });
  }
  return value;
}

let runCounter = 0;

/** Caller-side driver over one of the §5.6 run adapters. */
export function createHarnessDriver(options: HarnessDriverOptions): HarnessService {
  const manifest = options.manifest;

  async function runEvents(input: RunInput): Promise<{ id: string; frames: AsyncIterable<RunEvent> }> {
    const spec = manifest();
    if (spec.run === "http-runs") {
      const http = options.http ?? { createPath: "/v1/runs", eventsPath: (id: string) => `/v1/runs/${id}/events` };
      const request = requireTransport(options.transport, "request", spec.id);
      const created = await request({
        method: "POST",
        path: http.createPath,
        headers: input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : undefined,
        body: { prompt: input.prompt, live: input.live, payer: input.payer, tools: input.tools },
      });
      if (created.status !== 200 && created.status !== 201) {
        throw new HarnessError({ code: "RUN_FAILED", message: `${spec.id}: run create returned ${created.status}.` });
      }
      const id = String((created.body as { id?: string })?.id ?? "");
      const response = await request({ method: "GET", path: http.eventsPath(id) });
      const stream = response.stream ?? (async function* () {
        yield String(response.body ?? "");
      })();
      return { id, frames: normalizeRunEventFrames(streamFrames(stream)) };
    }
    if (spec.run === "openai-compat") {
      const request = requireTransport(options.transport, "request", spec.id);
      const response = await request({
        method: "POST",
        path: options.openai?.path ?? "/v1/chat/completions",
        body: {
          stream: true,
          messages: [{ role: "user", content: input.prompt }],
          // plan-only default: side-effecting tools stay planned (C25)
          metadata: { live: input.live, payer: input.payer },
        },
      });
      if (response.status !== 200) {
        throw new HarnessError({ code: "RUN_FAILED", message: `${spec.id}: chat completions returned ${response.status}.` });
      }
      const stream = response.stream ?? (async function* () {
        yield String(response.body ?? "");
      })();
      return { id: `run_${++runCounter}`, frames: normalizeOpenAiChunks(streamFrames(stream)) };
    }
    if (spec.run === "cli-exec" || spec.run === "rpc-jsonl") {
      const exec = requireTransport(options.transport, "exec", spec.id);
      const argv = options.cli?.argv(input) ?? [];
      if (argv.length === 0) {
        throw new HarnessError({ code: "HARNESS_UNAVAILABLE", message: `harness.${spec.id} declares no run argv.` });
      }
      const result = await exec(argv, spec.run === "rpc-jsonl" ? { stdin: JSON.stringify({ prompt: input.prompt, live: input.live }) } : undefined);
      if (result.exitCode !== 0) {
        throw new HarnessError({ code: "RUN_FAILED", message: `${spec.id}: exited ${result.exitCode}.` });
      }
      const events = normalizeJsonlLines(result.stdout);
      return {
        id: `run_${++runCounter}`,
        frames: (async function* () {
          for (const event of events) yield event;
        })(),
      };
    }
    // ws-jsonrpc
    const ws = requireTransport(options.transport, "ws", spec.id);
    const path = options.ws?.path(input) ?? "/";
    const payload = options.ws?.payload(input) ?? {
      jsonrpc: "2.0",
      id: 1,
      method: "run.start",
      params: { prompt: input.prompt, live: input.live, payer: input.payer },
    };
    const frames = await ws(path, payload);
    return { id: `run_${++runCounter}`, frames: normalizeJsonRpcFrames(frames) };
  }

  return {
    manifest,
    async bake(sandbox: SandboxHandle) {
      const spec = manifest();
      if (options.bakeScript) {
        const result = await sandbox.exec(["bash", "-lc", options.bakeScript]);
        if (result.exitCode !== 0) {
          throw new HarnessError({ code: "RUN_FAILED", message: `harness.${spec.id} bake failed (${result.exitCode}).` });
        }
      }
      // C30: record pins in ~/.zap/template.json (no secrets ever land here)
      const record = JSON.stringify({ harness: spec.id, pins: spec.pins });
      await sandbox.exec([
        "bash",
        "-lc",
        `mkdir -p ~/.zap && printf '%s' '${record.replace(/'/g, "'\\''")}' > ~/.zap/template.json`,
      ]);
    },
    async boot(sandbox: SandboxHandle) {
      for (const unit of manifest().units) {
        const result = await sandbox.exec(["systemctl", "is-active", unit]);
        if (result.exitCode !== 0) {
          throw new HarnessError({
            code: "HARNESS_UNAVAILABLE",
            message: `${unit} is not active in the runtime VM.`,
            remediation: "Boot the template snapshot and retry.",
          });
        }
      }
    },
    async health(sandbox: SandboxHandle) {
      const spec = manifest();
      const checks: Array<{ name: string; ok: boolean }> = [];
      for (const unit of spec.units) {
        const result = await sandbox.exec(["systemctl", "is-active", unit]);
        checks.push({ name: unit, ok: result.exitCode === 0 });
      }
      if (options.http?.healthPath && options.transport.request) {
        const response = await options.transport.request({ method: "GET", path: options.http.healthPath });
        checks.push({ name: "api", ok: response.status === 200 });
      }
      return { ok: checks.every((check) => check.ok), checks };
    },
    async run(_sandbox: SandboxHandle, input: RunInput): Promise<RunHandle> {
      const started = await runEvents(input);
      return {
        id: started.id,
        async *events() {
          yield { type: "run.started", live: input.live, payer: input.payer } satisfies RunEvent;
          for await (const event of started.frames) yield event;
        },
        async stop() {
          if (manifest().run === "http-runs" && options.transport.request && options.http) {
            await options.transport.request({ method: "POST", path: `${options.http.createPath}/${started.id}/stop` });
          }
        },
        async approve() {
          if (manifest().run === "http-runs" && options.transport.request && options.http) {
            await options.transport.request({ method: "POST", path: `${options.http.createPath}/${started.id}/approval` });
          }
        },
      };
    },
  };
}
