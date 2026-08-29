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
      description: "Check harness health (units, ports, MCP config) in a runtime.",
      inputSchema: {
        harness: z.string().optional().describe("Harness/template name, used when runtimeId is not given."),
        runtimeId: z.string().optional().describe("Runtime id to inspect."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ harness, runtimeId }) => {
      const target = runtimeId ?? harness;
      return cliTool(["harness", "doctor", ...(target ? [target] : []), "--json"]);
    },
  );
}
