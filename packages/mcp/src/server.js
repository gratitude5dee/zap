// @ts-check
// Zap MCP server (§5.10).
//
// Tool-module convention: drop a module at packages/mcp/src/tools/<domain>.js
// exporting `toolNames` (string[]) and `register(server)`. Every module in
// that directory is auto-discovered and registered here — new domains (e.g.
// agents.js) are added without touching this file. Modules load in sorted
// filename order; tool names must be globally unique.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const toolsDir = fileURLToPath(new URL("./tools/", import.meta.url));

/**
 * @typedef {{ toolNames: string[]; register: (server: McpServer) => void }} ToolModule
 */

/** @returns {Promise<ToolModule[]>} */
async function loadToolModules() {
  const entries = await fs.readdir(toolsDir);
  const files = entries.filter((entry) => entry.endsWith(".js")).sort();
  return await Promise.all(
    files.map(async (file) => /** @type {Promise<ToolModule>} */ (import(pathToFileURL(path.join(toolsDir, file)).href))),
  );
}

const toolModules = await loadToolModules();

/** All MCP tool names exposed by this server, in registration order. */
export const ZAP_MCP_TOOLS = toolModules.flatMap((module) => module.toolNames);

export async function startZapMcpServer({ transport = new StdioServerTransport() } = {}) {
  const server = createZapMcpServer();
  await server.connect(transport);
}

/** Builds the McpServer with every discovered tool module registered. */
export function createZapMcpServer() {
  const server = new McpServer(
    {
      name: "@wzrdtech/zap-mcp",
      version: "5.0.0-alpha.0",
      websiteUrl: "https://zap.wzrd.tech",
    },
    {
      capabilities: { tools: {} },
      instructions: [
        "Use Zap MCP tools to compose runtimes, validate, plan, inspect, deploy, and import Zap recipes.",
        "Plan-only is the default; live:true requires a configured payer.",
        "Live runs use the caller process environment and local Zap credential store.",
        "Secret values are never returned by any tool; zap_keys_list masks values.",
      ].join(" "),
    },
  );
  for (const module of toolModules) module.register(server);
  return server;
}
