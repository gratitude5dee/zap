// @ts-check
// Harness inspection tools over `zap harness` (§5.10).
import * as z from "zod/v4";
import { cliTool } from "../tool-helpers.js";

export const toolNames = ["zap_harness_ls", "zap_harness_doctor"];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_harness_ls",
    {
      title: "List Harnesses",
      description: "List harnesses available in a runtime (or the harness registry).",
      inputSchema: {
        runtimeId: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ runtimeId }) => cliTool(["harness", "ls", ...(runtimeId ? [runtimeId] : []), "--json"]),
  );

  server.registerTool(
    "zap_harness_doctor",
    {
      title: "Harness Doctor",
      description: "Check harness health (units, ports, MCP config) for a harness or template.",
      inputSchema: {
        harness: z.string().optional().describe("Harness id or zap-heavy-* template to inspect (the CLI resolves templates, not runtime ids)."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ harness }) => cliTool(["harness", "doctor", ...(harness ? [harness] : []), "--json"]),
  );
}
