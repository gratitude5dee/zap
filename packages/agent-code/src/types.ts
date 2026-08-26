// @wzrdtech/zap-agent public types (§5.12).
import type { MeterUnit as CoreMeterUnit } from "@wzrdtech/core";
import type { ExecResult, LaneId } from "@wzrdtech/zap-sandbox";
import type { MemoryService } from "@wzrdtech/zap-memory";
import type { RuntimeSpec } from "@wzrdtech/core/runtime-spec";

export type AgentInput = {
  source: "cli" | "mcp" | "api" | "studio" | "channel" | "subagent";
  text?: string;
  payload?: unknown;
  live: boolean;
  sessionId: string;
  turn: number;
  alias: string;
};
export type ModelId = `${"openrouter" | "gateway" | "openai" | "anthropic" | "xai" | "gmi"}/${string}`;
/** opaque; never carries a value */
export type SecretRef = { readonly __brand: "SecretRef"; readonly name: string };
export type HeaderValue =
  | string
  | SecretRef
  | { readonly __brand: "HeaderValue"; readonly scheme: "Bearer"; readonly ref: SecretRef };
/** JSON Schema 2020-12 object schema */
export type JsonSchema = Record<string, unknown>;
export type ToolInput = Record<string, unknown>;
export type MeterUnit = CoreMeterUnit;
export interface MediaFsLike {
  put(
    kind: "image" | "audio" | "video" | "3d",
    bytes: Uint8Array | ReadableStream,
    sidecar: Record<string, unknown>,
  ): Promise<{ sha256: string; path: string }>;
  get(sha256: string): Promise<{ bytes: Uint8Array; sidecar: Record<string, unknown> } | null>;
  link(sha256: string, into: string): Promise<void>;
}
export type TurnMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; input: unknown }>;
};

export interface ToolContext<I> {
  input: I;
  sandbox: {
    exec(
      argv: readonly string[] | string,
      opts?: {
        cwd?: string;
        env?: Record<string, string>;
        timeoutMs?: number;
        lane?: LaneId;
        signal?: AbortSignal;
      },
    ): Promise<ExecResult>;
  };
  /** rooted at /zap/fs */
  fs: {
    read(path: string): Promise<Uint8Array | null>;
    write(path: string, bytes: Uint8Array | string): Promise<void>;
    readdir(path: string): Promise<string[]>;
  };
  mediafs?: MediaFsLike;
  connections: Record<
    string,
    {
      fetch(
        relativePath: string,
        init?: { method?: string; headers?: Record<string, string>; body?: BodyInit; signal?: AbortSignal },
      ): Promise<Response>;
    }
  >;
  session: {
    id: string;
    alias: string;
    data: {
      get<T = unknown>(key: string): Promise<T | undefined>;
      set(key: string, value: unknown): Promise<void>;
    };
  };
  /** heavy only; content methods allowed here (in-VM) */
  memory?: MemoryService;
  signal: AbortSignal;
  reportProgress(p: { phase: string; percent?: number; note?: string }): Promise<void>;
  /** false = plan-only turn; a side-effecting tool is never invoked when false */
  live: boolean;
  /** redacted before it leaves the VM */
  log(entry: Record<string, unknown>): void;
}

export interface ToolDefinition<I extends ToolInput = ToolInput, O = unknown> {
  name: string;
  description: string;
  input: JsonSchema;
  readOnly?: boolean;
  estimate?(input: I): { unit: MeterUnit; qty: number; sku?: string }[];
  run(ctx: ToolContext<I>): Promise<O>;
}
export interface Tool<I extends ToolInput = ToolInput, O = unknown> {
  readonly __brand: "Tool";
  readonly definition: ToolDefinition<I, O>;
}
export type AnyTool = Tool<ToolInput, unknown>;

export interface ConnectionDefinition {
  id: string;
  origin: `https://${string}`;
  methods: readonly ("GET" | "POST" | "PUT" | "PATCH" | "DELETE")[];
  pathPrefix: `/${string}`;
  headers?: Record<string, HeaderValue>;
  sensitiveHeaders?: readonly string[];
  timeoutMs?: number;
}
export interface Connection {
  readonly __brand: "Connection";
  readonly definition: ConnectionDefinition;
}

export interface McpServerDefinition {
  id: string;
  url?: `https://${string}`;
  command?: readonly string[];
  headers?: Record<string, HeaderValue>;
  sensitiveHeaders?: readonly string[];
  toolFilter?: { include?: string[]; exclude?: string[] };
  /** MCP tool names plan-only must not call; default: none */
  sideEffecting?: readonly string[];
}
export interface McpServerRef {
  readonly __brand: "McpServerRef";
  readonly definition: McpServerDefinition;
}

export interface Agent {
  readonly __brand: "Agent";
  readonly render: () => string;
  readonly meta?: { id?: string; description?: string; skillsDir?: string };
}

export interface Project {
  readonly __brand: "Project";
  readonly name?: string;
  readonly agents: Record<string, () => Promise<{ default: Agent }>>;
  readonly runtime?: string | RuntimeSpec;
  readonly aliases: readonly string[];
}

/** full scope a secret resolution is checked against (§5.12) */
export interface SecretScope {
  project: string;
  agentId: string;
  alias: string;
  connectionId: string;
  origin: string;
  method: string;
  path: string;
}

/** the (agent, alias) half of the scope known when a connection is built */
export interface ConnectionScope {
  project: string;
  agentId: string;
  alias: string;
}

export type ResolveSecret = (ref: SecretRef, scope: SecretScope) => Promise<string>;

/** the Z12 event union streamed over turn SSE and `zap session --json` */
export type AgentEvent =
  | { type: "turn.started"; sessionId: string; turn: number; live: boolean; payer: string }
  | {
      type: "render";
      sessionId: string;
      turn: number;
      instructions: string;
      model: ModelId;
      tools: string[];
      mcpServers: string[];
      subagents: string[];
    }
  | { type: "text.delta"; text: string }
  | { type: "tool.call"; tool: string; input: unknown }
  | { type: "tool.result"; tool: string; output: unknown; usage?: unknown }
  | { type: "tool.planned"; tool: string; input: unknown; estimate: unknown }
  | { type: "approval.required"; tool: string; input: unknown }
  | { type: "turn.completed"; sessionId: string; turn: number; text: string; usage: unknown }
  | { type: "turn.failed"; sessionId: string; turn: number; code: string; remediation?: string };

export class AgentCodeError extends Error {
  readonly code: string;
  readonly remediation?: string;

  constructor(code: string, message: string, remediation?: string) {
    super(message);
    this.name = "AgentCodeError";
    this.code = code;
    this.remediation = remediation;
  }
}
