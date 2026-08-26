// Constructors: plain, side-effect free value builders (legal outside render).
import type { RuntimeSpec } from "@wzrdtech/core/runtime-spec";
import {
  AgentCodeError,
  type Agent,
  type Connection,
  type ConnectionDefinition,
  type HeaderValue,
  type McpServerDefinition,
  type McpServerRef,
  type Project,
  type SecretRef,
  type Tool,
  type ToolDefinition,
  type ToolInput,
} from "./types.ts";

export function defineTool<I extends ToolInput = ToolInput, O = unknown>(def: ToolDefinition<I, O>): Tool<I, O> {
  return { __brand: "Tool", definition: def };
}

/** wraps a 0.3.1 Zap.md recipe; plan by default */
export function defineRecipeTool(
  slug: string,
  opts?: { extendCount?: number },
): Tool<{ inputs: Record<string, string> }, { runId: string; status: string; quoteUsd: number }> {
  return defineTool({
    name: `recipe:${slug}`,
    description: `Run the ${slug} Zap.md recipe (plan by default).`,
    input: {
      type: "object",
      properties: { inputs: { type: "object", additionalProperties: { type: "string" } } },
      required: ["inputs"],
      additionalProperties: false,
    },
    async run(ctx) {
      const args = ["zap", "run", `agent/skills/zap-${slug}/Zap.md`, "--json"];
      if (ctx.live) args.push("--live");
      if (opts?.extendCount !== undefined) args.push("--extend", String(opts.extendCount));
      for (const [key, value] of Object.entries(ctx.input.inputs ?? {})) {
        args.push("--input", `${key}=${value}`);
      }
      const result = await ctx.sandbox.exec(args, { signal: ctx.signal });
      if (result.exitCode !== 0) {
        throw new AgentCodeError("RECIPE_RUN_FAILED", `recipe ${slug} exited ${result.exitCode}`);
      }
      const parsed = JSON.parse(result.stdout || "{}") as { runId?: string; status?: string; quoteUsd?: number };
      return {
        runId: parsed.runId ?? "",
        status: parsed.status ?? (ctx.live ? "completed" : "planned"),
        quoteUsd: parsed.quoteUsd ?? 0,
      };
    },
  });
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
