// @ts-check
// Memory tools over `zap memory` (§5.10). remember writes durable memory and
// is therefore annotated destructive; search is read-only.
import * as z from "zod/v4";
import { cliTool } from "../tool-helpers.js";

export const toolNames = ["zap_memory_search", "zap_memory_remember"];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_memory_search",
    {
      title: "Memory Search",
      description: "Search runtime memory.",
      inputSchema: {
        query: z.string(),
        scope: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, scope }) => cliTool(["memory", "search", query, ...(scope ? ["--scope", scope] : []), "--json"]),
  );

  server.registerTool(
    "zap_memory_remember",
    {
      title: "Memory Remember",
      description: "Store a durable memory item.",
      inputSchema: {
        durable: z.boolean().default(true),
        scope: z.string().optional(),
        text: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ durable, scope, text }) => {
      const args = ["memory", "remember", text, "--json"];
      if (!durable) args.push("--session");
      if (scope) args.push("--scope", scope);
      return cliTool(args);
    },
  );
}
