// apistore.context7 — registers the hosted Context7 MCP endpoint
// (https://mcp.context7.com/mcp) in every harness mcpConfig. The API key is
// referenced as ${CONTEXT7_API_KEY} in fragments; the value stays in the
// per-box env and never appears in rendered config (C6/C15).
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import { renderMcpFragment, type McpConfigFormat, type McpServerFragment } from "./fragments.ts";

export const CONTEXT7_MCP_URL = "https://mcp.context7.com/mcp";

export interface Context7PluginConfig {
  /** Env var holding the API key. Defaults to CONTEXT7_API_KEY. */
  apiKeyEnv?: string;
}

const schema = z
  .object({
    apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/).optional(),
  })
  .optional();

export function context7McpServer(config?: Context7PluginConfig): McpServerFragment {
  const apiKeyEnv = config?.apiKeyEnv ?? "CONTEXT7_API_KEY";
  return {
    headers: { CONTEXT7_API_KEY: `\${${apiKeyEnv}}` },
    id: "context7",
    url: CONTEXT7_MCP_URL,
  };
}

export function context7Fragment(format: McpConfigFormat, config?: Context7PluginConfig): string {
  return renderMcpFragment(format, context7McpServer(config));
}

export const context7 = definePlugin<Context7PluginConfig | undefined>({
  name: "apistore.context7",
  schema,
  async apply(ctx, config) {
    const server = context7McpServer(config);
    await ctx.effect(() =>
      ctx.provide("apistore.context7", {
        fragment: (format: McpConfigFormat) => renderMcpFragment(format, server),
        server,
      }),
    );
  },
});
