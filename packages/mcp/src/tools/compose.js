// @ts-check
// Compose + template tools over `zap compose` and `zap template` (§5.10).
import * as z from "zod/v4";
import { cliTool } from "../tool-helpers.js";

export const toolNames = ["zap_compose", "zap_template_ls"];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_compose",
    {
      title: "Compose Zap Runtime",
      description: "Resolve Runtime.md or zap.config.ts into the runtime plugin tree (dry-run plan).",
      inputSchema: {
        file: z.string().optional().describe("Path to Runtime.md or zap.config.ts."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ file }) => cliTool(["compose", ...(file ? [file] : []), "--dry-run", "--json"]),
  );

  server.registerTool(
    "zap_template_ls",
    {
      title: "List Zap Templates",
      description: "List runtime templates under .zap/templates.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => cliTool(["template", "ls", "--json"]),
  );
}
