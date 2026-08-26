import type { Context, Disposer } from "@wzrdtech/zap-kernel";

/** Minimal app surface a route module mounts on (zap-agentd serve or fakeAgentd). */
export interface AgentdApp {
  route(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    handler: (req: AgentdRequest) => Promise<AgentdResponse> | AgentdResponse,
  ): void;
}

export interface AgentdRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
}

export interface AgentdResponse {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  /** SSE / JSONL streaming payloads */
  stream?: AsyncIterable<string>;
}

/**
 * Route-module contract: zap-agentd serve (session B) mounts these; E's
 * /v1/runs and K's /v1/sessions implement it; fakeAgentd hosts them in-process.
 */
export interface AgentdRouteModule {
  prefix: string;
  mount(app: AgentdApp, ctx: Context): Disposer;
}
