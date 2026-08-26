// @wzrdtech/zap-agent public surface (§5.12). Typed stubs at Z0; session K
// replaces the render frame, guard, and build pipeline.
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

export class AgentCodeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentCodeError";
    this.code = code;
  }
}

function notImplemented(what: string): never {
  throw new AgentCodeError("NOT_IMPLEMENTED", `${what} is not implemented yet (session K, Z8)`);
}

export function defineTool<I extends ToolInput = ToolInput, O = unknown>(def: ToolDefinition<I, O>): Tool<I, O> {
  return { __brand: "Tool", definition: def };
}

/** wraps a 0.3.1 Zap.md recipe; plan by default */
export function defineRecipeTool(
  slug: string,
  opts?: { extendCount?: number },
): Tool<{ inputs: Record<string, string> }, { runId: string; status: string; quoteUsd: number }> {
  void slug;
  void opts;
  return notImplemented("defineRecipeTool");
}

export function defineConnection(def: ConnectionDefinition): Connection {
  return { __brand: "Connection", definition: def };
}

export function defineMcpServer(def: McpServerDefinition): McpServerRef {
  return { __brand: "McpServerRef", definition: def };
}

/** mints an opaque ref; legal anywhere — it is not a render hook */
export function useSecret(name: string): SecretRef {
  return { __brand: "SecretRef", name };
}

export function bearer(ref: SecretRef): HeaderValue {
  return { __brand: "HeaderValue", scheme: "Bearer", ref };
}

export function useInput(): AgentInput {
  return notImplemented("useInput");
}

export function useModel(id: ModelId, opts?: { reasoning?: "low" | "medium" | "high"; maxOutputTokens?: number }): void {
  void id;
  void opts;
  notImplemented("useModel");
}

export function useTool<I extends ToolInput, O>(tool: Tool<I, O>): void {
  void tool;
  notImplemented("useTool");
}

export function useMcpServer(id: string): void {
  void id;
  notImplemented("useMcpServer");
}

export function useSubagent(id: string, opts?: { maxTurns?: number }): void {
  void id;
  void opts;
  notImplemented("useSubagent");
}

/** sync; snapshot taken before render */
export function useSessionData<T = unknown>(key: string): T | undefined {
  void key;
  return notImplemented("useSessionData");
}

export function defineAgent(
  render: () => string,
  meta?: { id?: string; description?: string; skillsDir?: string },
): Agent {
  return { __brand: "Agent", render, meta };
}

export function defineProject(p: {
  name?: string;
  agents: Record<string, () => Promise<{ default: Agent }>>;
  runtime?: string | RuntimeSpec;
  aliases?: readonly string[];
}): Project {
  return {
    __brand: "Project",
    name: p.name,
    agents: p.agents,
    runtime: p.runtime,
    aliases: p.aliases ?? ["development", "production"],
  };
}
