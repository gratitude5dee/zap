// @ts-check
// Doctor tool over `zap doctor` (§5.10).
import { cliTool } from "../tool-helpers.js";

export const toolNames = ["zap_doctor"];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_doctor",
    {
      title: "Zap Doctor",
      description: "Check local Zap setup: Node version, credentials store, payer state, sandbox providers.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => cliTool(["doctor", "--json"]),
  );
}
