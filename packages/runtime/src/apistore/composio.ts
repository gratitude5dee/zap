// apistore.composio — attaches catalog SaaS APIs through a Composio hosted
// MCP session (entity = tenant id), following the existing control-plane
// pattern in lib/sprite-composio.ts. The session URL/headers are produced by
// the control plane; this plugin only turns them into harness mcpConfig
// fragments. Session headers reference env vars, never literal secrets.
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import { renderMcpFragment, type McpConfigFormat, type McpServerFragment } from "./fragments.ts";

export interface ComposioSession {
  /** Hosted MCP session URL minted by the control plane for the tenant. */
  url: string;
  /** Header names → `${ENV_VAR}` references, never literal secret values. */
  headers?: Record<string, string>;
}

export interface ComposioPluginConfig {
  session: ComposioSession;
  toolkits?: string[];
}

const sessionSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  url: z.string().url().startsWith("https://"),
});

const schema = z.object({
  session: sessionSchema,
  toolkits: z.array(z.string().min(1)).optional(),
});

export function composioMcpServer(session: ComposioSession): McpServerFragment {
  return {
    ...(session.headers ? { headers: session.headers } : {}),
    id: "composio",
    url: session.url,
  };
}

export function composioFragment(format: McpConfigFormat, session: ComposioSession): string {
  return renderMcpFragment(format, composioMcpServer(session));
}

export const composio = definePlugin<ComposioPluginConfig>({
  name: "apistore.composio",
  schema,
  async apply(ctx, config) {
    const server = composioMcpServer(config.session);
    await ctx.effect(() =>
      ctx.provide("apistore.composio", {
        fragment: (format: McpConfigFormat) => renderMcpFragment(format, server),
        server,
        toolkits: config.toolkits ?? [],
      }),
    );
  },
});
