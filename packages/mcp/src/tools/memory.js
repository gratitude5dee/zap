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
        session: z.string().optional().describe("Session scope id."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ query, session }) => cliTool(["memory", "search", query, ...(session ? ["--session", session] : []), "--json"]),
  );

  server.registerTool(
    "zap_memory_remember",
    {
      title: "Memory Remember",
      description: "Store a durable memory item.",
      inputSchema: {
        durable: z.boolean().default(true),
        session: z.string().optional().describe("Session scope id."),
        text: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ durable, session, text }) => {
      const args = ["memory", "remember", text, "--json"];
      if (!durable) args.push("--ephemeral");
      if (session) args.push("--session", session);
      return cliTool(args);
    },
  );
}
