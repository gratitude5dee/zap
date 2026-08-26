// harness.zap — two exports, one file (§5.6):
//  (a) the executor: ZapExecutor.executeStep — steps 3-5 of the §4.12 turn
//      loop as one model call plus its tool calls over ctx.llm; in-VM only.
//  (b) the driver: caller-side HarnessService over http-runs against
//      zap-agentd POST /v1/runs. No model loop ever runs in the caller.
import type {
  AnyTool,
  McpServerDefinition,
  ModelId,
  ToolContext,
  TurnMessage,
} from "@wzrdtech/zap-agent";
import { definePlugin, type Context, type RunEvent } from "@wzrdtech/zap-kernel";
import type { SandboxHandle, SandboxService } from "@wzrdtech/zap-sandbox";
import { z } from "zod";
import type { LlmStepResult, LlmToolSpec } from "../gateway/index.ts";

export class HarnessError extends Error {
  readonly code: "PAYER_MISSING" | "LIVE_REQUIRED" | "HARNESS_UNAVAILABLE" | "SANDBOX_MISMATCH" | "RUN_FAILED";
  readonly remediation?: string;

  constructor(options: { code: HarnessError["code"]; message: string; remediation?: string }) {
    super(options.message);
    this.name = "HarnessError";
    this.code = options.code;
    this.remediation = options.remediation;
  }
}

// ---------------------------------------------------------------------------
// §5.6 harness contract types
// ---------------------------------------------------------------------------

export interface HarnessManifest {
  id:
    | "zap" | "hermes" | "openclaw" | "opencode" | "deepseek" | "grok" | "omg" | "pi" | "cursor"
    | "devin" | "kimi" | "interpreter" | "agno" | "prime" | "headlong" | "frontier" | "fx";
  minWeight: "light" | "med" | "heavy";
  inProcess?: true;
  pullOnly?: true;
  pins: Record<string, string>;
  ports: Array<{ port: number; role: "api" | "dashboard" | "bridge"; hostPrivate: boolean }>;
  units: string[];
  stateDirs: string[];
  skillsDirs: string[];
  mcpConfig: { path: string; format: "yaml" | "json" | "json5" | "toml" | "cli" };
  llmAuth: Array<{ env: string; mode: "byok" | "claude-code" | "codex" | "managed" }>;
  disabledInbound: string[];
  run: "http-runs" | "openai-compat" | "rpc-jsonl" | "cli-exec" | "ws-jsonrpc";
  managedGateway?: { file: string; key: string; flavor: "openai" | "anthropic" };
}

export interface RunInput {
  prompt: string;
  live: boolean;
  payer: string;
  tools?: string[];
  idempotencyKey?: string;
}

export interface RunHandle {
  id: string;
  events(): AsyncIterable<RunEvent>;
  stop(): Promise<void>;
  approve(): Promise<void>;
}

export interface HarnessService {
  manifest(): HarnessManifest;
  bake(sandbox: SandboxHandle): Promise<void>;
  boot(sandbox: SandboxHandle): Promise<void>;
  health(sandbox: SandboxHandle): Promise<{ ok: boolean; checks: Array<{ name: string; ok: boolean }> }>;
  run(sandbox: SandboxHandle, input: RunInput): Promise<RunHandle>;
}

// ---------------------------------------------------------------------------
// §5.6 executor types
// ---------------------------------------------------------------------------

export interface StepCapabilities {
  instructions: string;
  model: ModelId;
  tools: ReadonlyMap<string, AnyTool>;
  mcpServers: ReadonlySet<string>;
  subagents: ReadonlyMap<string, { maxTurns?: number }>;
}

export interface McpClient {
  listTools(): Promise<Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>>;
  callTool(name: string, input: unknown, opts?: { signal?: AbortSignal }): Promise<unknown>;
  close(): Promise<void>;
}

export interface ExecuteStepOptions {
  signal: AbortSignal;
  history: ReadonlyArray<TurnMessage>;
  mcp: ReadonlyMap<string, { definition: McpServerDefinition; client(): Promise<McpClient> }>;
  delegate?(subagentId: string, input: { text?: string; payload?: unknown }): Promise<{ text: string; events: RunEvent[] }>;
  onEvent(e: StepEvent): void;
  toolContext: Omit<ToolContext<never>, "input" | "signal">;
}

export type StepEvent = Extract<
  RunEvent,
  { type: "text.delta" | "tool.call" | "tool.result" | "tool.planned" | "approval.required" }
>;

export type TokenUsage = { inputTokens: number; outputTokens: number; reasoningTokens?: number; usd: number };

export type StepResult =
  | { kind: "final"; text: string; usage: TokenUsage }
  | { kind: "needs-render"; messages: TurnMessage[]; usage: TokenUsage };

export interface ZapExecutor {
  executeStep(ctx: Context, caps: StepCapabilities, opts: ExecuteStepOptions): Promise<StepResult>;
}

/** the model-call service the executor injects as "llm" (in-VM gateway) */
export interface LlmStepService {
  step(req: { model: string; messages: TurnMessage[]; tools?: LlmToolSpec[]; signal?: AbortSignal }): Promise<LlmStepResult>;
}

/** pay.delegated / fake pay: status() may be sync ("byok") or async ({ mode }) */
export interface PayStatusService {
  status():
    | "missing" | "byok" | "managed"
    | Promise<"missing" | "byok" | "managed" | { mode: "missing" | "byok" | "managed" }>
    | { mode: "missing" | "byok" | "managed" };
}

export async function resolvePayerMode(pay: PayStatusService | undefined): Promise<"missing" | "byok" | "managed"> {
  if (!pay) return "missing";
  const status = await pay.status();
  return typeof status === "string" ? status : status.mode;
}

// ---------------------------------------------------------------------------
// executor implementation
// ---------------------------------------------------------------------------

async function collectMcpTools(
  caps: StepCapabilities,
  opts: ExecuteStepOptions,
): Promise<Map<string, { serverId: string; client: McpClient; sideEffecting: boolean; spec: LlmToolSpec }>> {
  const tools = new Map<string, { serverId: string; client: McpClient; sideEffecting: boolean; spec: LlmToolSpec }>();
  for (const serverId of caps.mcpServers) {
    const entry = opts.mcp.get(serverId);
    if (!entry) continue;
    const client = await entry.client();
    for (const tool of await client.listTools()) {
      tools.set(tool.name, {
        serverId,
        client,
        sideEffecting: entry.definition.sideEffecting?.includes(tool.name) ?? false,
        spec: { name: tool.name, description: tool.description, inputSchema: tool.inputSchema },
      });
    }
  }
  return tools;
}

export async function executeStep(ctx: Context, caps: StepCapabilities, opts: ExecuteStepOptions): Promise<StepResult> {
  const payerMode = await resolvePayerMode(ctx.get<PayStatusService>("pay"));
  if (payerMode === "missing") {
    throw new HarnessError({
      code: "PAYER_MISSING",
      message: "No payer resolves for this runtime; a model call spends in both plan-only and live modes.",
      remediation: "Configure a provider key (byok) or run zap pay login --managed.",
    });
  }

  const llm = await ctx.inject<LlmStepService>("llm");
  const live = opts.toolContext.live;
  const mcpTools = await collectMcpTools(caps, opts);

  const toolSpecs: LlmToolSpec[] = [
    ...[...caps.tools.values()].map((tool) => ({
      name: tool.definition.name,
      description: tool.definition.description,
      inputSchema: tool.definition.input,
    })),
    ...[...mcpTools.values()].map((entry) => entry.spec),
    ...[...caps.subagents.keys()].map((subagentId) => ({
      name: `subagent:${subagentId}`,
      description: `Delegate to the ${subagentId} subagent.`,
      inputSchema: { type: "object", properties: { text: { type: "string" } } },
    })),
  ];

  const messages: TurnMessage[] = [
    { role: "system", content: caps.instructions },
    ...opts.history,
  ];
  const result = await llm.step({ model: caps.model, messages, tools: toolSpecs, signal: opts.signal });
  if (result.text) opts.onEvent({ type: "text.delta", text: result.text });

  const usage: TokenUsage = {
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    reasoningTokens: result.usage.reasoningTokens,
    usd: result.usage.usd,
  };

  if (result.toolCalls.length === 0) {
    return { kind: "final", text: result.text, usage };
  }

  const followups: TurnMessage[] = [
    {
      role: "assistant",
      content: result.text,
      toolCalls: result.toolCalls.map((call) => ({ id: call.id, name: call.name, input: call.input })),
    },
  ];
  let executed = false;

  for (const call of result.toolCalls) {
    if (call.name.startsWith("subagent:")) {
      const subagentId = call.name.slice("subagent:".length);
      if (!caps.subagents.has(subagentId) || !opts.delegate) {
        followups.push({ role: "tool", content: `Unknown subagent ${subagentId}.`, toolCallId: call.id });
        continue;
      }
      opts.onEvent({ type: "tool.call", tool: call.name, input: call.input });
      const delegated = await opts.delegate(subagentId, { text: String((call.input as { text?: string })?.text ?? "") });
      opts.onEvent({ type: "tool.result", tool: call.name, output: delegated.text });
      followups.push({ role: "tool", content: delegated.text, toolCallId: call.id });
      executed = true;
      continue;
    }

    const mcpTool = mcpTools.get(call.name);
    if (mcpTool) {
      if (!live && mcpTool.sideEffecting) {
        opts.onEvent({ type: "tool.planned", tool: call.name, input: call.input, estimate: [] });
        followups.push({ role: "tool", content: `Planned (plan-only): ${call.name}.`, toolCallId: call.id });
        continue;
      }
      opts.onEvent({ type: "tool.call", tool: call.name, input: call.input });
      const output = await mcpTool.client.callTool(call.name, call.input, { signal: opts.signal });
      opts.onEvent({ type: "tool.result", tool: call.name, output });
      followups.push({ role: "tool", content: JSON.stringify(output), toolCallId: call.id });
      executed = true;
      continue;
    }

    const tool = caps.tools.get(call.name);
    if (!tool) {
      followups.push({ role: "tool", content: `Unknown tool ${call.name}.`, toolCallId: call.id });
      continue;
    }
    if (!live && !tool.definition.readOnly) {
      const estimate = tool.definition.estimate?.(call.input as Record<string, unknown>) ?? [];
      opts.onEvent({ type: "tool.planned", tool: call.name, input: call.input, estimate });
      followups.push({ role: "tool", content: `Planned (plan-only): ${call.name}.`, toolCallId: call.id });
      continue;
    }
    opts.onEvent({ type: "tool.call", tool: call.name, input: call.input });
    const output = await tool.definition.run({
      ...(opts.toolContext as ToolContext<never>),
      input: call.input as never,
      signal: opts.signal,
    });
    opts.onEvent({ type: "tool.result", tool: call.name, output });
    followups.push({ role: "tool", content: JSON.stringify(output ?? null), toolCallId: call.id });
    executed = true;
  }

  if (!executed) {
    return { kind: "final", text: result.text, usage };
  }
  return { kind: "needs-render", messages: followups, usage };
}

export const zapExecutor: ZapExecutor = { executeStep };

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------

export function zapHarnessManifest(): HarnessManifest {
  return {
    id: "zap",
    minWeight: "med",
    inProcess: true,
    pins: {},
    ports: [{ port: 8722, role: "api", hostPrivate: true }],
    units: ["zap-agentd.service"],
    stateDirs: ["/zap"],
    skillsDirs: ["/zap/skills"],
    mcpConfig: { path: "/zap/mcp.json", format: "json" },
    llmAuth: [],
    disabledInbound: [],
    run: "http-runs",
  };
}

// ---------------------------------------------------------------------------
// plugins: in-VM executor + caller-side driver
// ---------------------------------------------------------------------------

const executorSchema = z.undefined().optional();

/** In-VM only: mounts the executor service; refuses non-local sandboxes. */
export const harnessZapExecutor = definePlugin<undefined>({
  name: "harness.zap.executor",
  schema: executorSchema,
  apply(ctx) {
    const sandbox = ctx.get<SandboxService>("sandbox");
    const provider = sandbox?.default;
    const fakeAllowed = provider === "fake" && process.env.ZAP_ALLOW_FAKE_SANDBOX === "1";
    if (provider !== "local" && !fakeAllowed) {
      throw new HarnessError({
        code: "SANDBOX_MISMATCH",
        message: "harness.zap executor mounts only in the VM (sandbox.local, or fake with ZAP_ALLOW_FAKE_SANDBOX=1).",
        remediation: "Mount harnessZapDriver() in caller kernels instead.",
      });
    }
    ctx.provide("executor", zapExecutor);
  },
});

/** Transport the driver uses to reach zap-agentd's /v1 routes over the sandbox handle. */
export interface RunsTransport {
  request(req: {
    method: "GET" | "POST";
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<{ status: number; body?: unknown; stream?: AsyncIterable<string> }>;
}

/** fake/real meter surface the driver reserves against and settles into */
export interface DriverMeter {
  quote(plan: { lines: Array<{ unit: string; qty: number; sku: string }> }): Promise<{ usd: number }>;
  record(line: { unit: string; qty: number; usd: number; sku: string }): void;
}

export interface HarnessZapDriverConfig {
  transport: RunsTransport;
  meter?: DriverMeter;
}

function parseSseEvents(payload: string): RunEvent[] {
  return payload
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data:"))
    .map((chunk) => JSON.parse(chunk.slice("data:".length).trim()) as RunEvent);
}

export function createZapDriverService(transport: RunsTransport, meter?: DriverMeter): HarnessService {
  return {
    manifest: zapHarnessManifest,
    async bake() {
      // no-op: harness.zap is zap-agentd itself
    },
    async boot(sandbox) {
      const result = await sandbox.exec(["systemctl", "is-active", "zap-agentd.service"]);
      if (result.exitCode !== 0) {
        throw new HarnessError({
          code: "HARNESS_UNAVAILABLE",
          message: "zap-agentd.service is not active in the runtime VM.",
          remediation: "Boot the runtime template and retry.",
        });
      }
    },
    async health() {
      const response = await transport.request({ method: "GET", path: "/v1/health" });
      const ok = response.status === 200;
      return { ok, checks: [{ name: "agentd", ok }] };
    },
    async run(_sandbox, input) {
      // reserve before dispatch; settled from run.completed usage below
      await meter?.quote({ lines: [{ unit: "sandbox_second", qty: 1, sku: "harness.zap.run" }] });
      const created = await transport.request({
        method: "POST",
        path: "/v1/runs",
        headers: input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : undefined,
        body: { live: input.live, payer: input.payer, prompt: input.prompt, tools: input.tools },
      });
      if (created.status !== 200 && created.status !== 201) {
        throw new HarnessError({
          code: "RUN_FAILED",
          message: `POST /v1/runs returned status ${created.status}.`,
        });
      }
      const id = String((created.body as { id?: string })?.id ?? "");
      return {
        id,
        async *events() {
          const response = await transport.request({ method: "GET", path: `/v1/runs/${id}/events` });
          const settle = (event: RunEvent): RunEvent => {
            if (event.type === "run.completed" && meter) {
              const usage = event.usage as { tokens?: { inputTokens?: number; outputTokens?: number; usd?: number } };
              meter.record({
                unit: "gateway_output_token",
                qty: usage.tokens?.outputTokens ?? 0,
                usd: usage.tokens?.usd ?? 0,
                sku: "harness.zap.run",
              });
            }
            return event;
          };
          if (response.stream) {
            for await (const chunk of response.stream) {
              for (const event of parseSseEvents(chunk)) yield settle(event);
            }
            return;
          }
          for (const event of parseSseEvents(String(response.body ?? ""))) yield settle(event);
        },
        async stop() {
          await transport.request({ method: "POST", path: `/v1/runs/${id}/stop` });
        },
        async approve() {
          await transport.request({ method: "POST", path: `/v1/runs/${id}/approve` });
        },
      };
    },
  };
}

const driverSchema = z.object({
  transport: z.custom<RunsTransport>((value) => typeof value === "object" && value !== null),
  meter: z.custom<DriverMeter>((value) => typeof value === "object" && value !== null).optional(),
});

/** Caller-side http-runs driver; never mounts beside sandbox.local. */
export const harnessZapDriver = definePlugin<HarnessZapDriverConfig>({
  name: "harness.zap",
  schema: driverSchema,
  apply(ctx, config) {
    const sandbox = ctx.get<SandboxService>("sandbox");
    if (sandbox?.default === "local") {
      throw new HarnessError({
        code: "SANDBOX_MISMATCH",
        message: "harness.zap driver is caller-side and never mounts beside sandbox.local.",
        remediation: "Mount harnessZapExecutor() in the in-VM kernel instead.",
      });
    }
    ctx.provide("harness", createZapDriverService(config.transport, config.meter));
  },
});
