// @ts-check
// Payer tools over `zap pay` (§5.10). Read-only: quoting and status never
// spend, and there is no secret-writing MCP tool (C6).
import * as z from "zod/v4";
import { cliTool } from "../tool-helpers.js";

export const toolNames = ["zap_pay_status", "zap_pay_quote"];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_pay_status",
    {
      title: "Payer Status",
      description: "Show the resolved payer (byok, managed, or missing). Never returns secret values.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => cliTool(["pay", "status", "--json"]),
  );

  server.registerTool(
    "zap_pay_quote",
    {
      title: "Payer Quote",
      description: "Quote the estimated cost of a provider call without spending.",
      inputSchema: {
        model: z.string().optional(),
        provider: z.string(),
        units: z.number().positive().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ model, provider, units }) => {
      const args = ["pay", "quote", "--provider", provider, "--json"];
      if (model) args.push("--model", model);
      if (units !== undefined) args.push("--units", String(units));
      return cliTool(args);
    },
  );
}
