// @ts-check
// Agents-as-code tools over `zap agent` / `zap session` / `zap secret` (Z12).
// live:true is payer-gated (C5) and never the default; there is no
// secret-writing tool and no tool ever returns a secret value.
import * as z from "zod/v4";
import { cliTool, refuseLiveWithoutPayer } from "../tool-helpers.js";

/**
 * @typedef {import("zod/v4").infer<typeof import("@modelcontextprotocol/sdk/types.js").CallToolResultSchema>} CallToolResult
 */

/**
 * Narrows a tool-helper payload to the SDK's CallToolResult shape.
 * @param {string[]} args
 * @returns {Promise<CallToolResult>}
 */
async function agentCliTool(args) {
  return /** @type {CallToolResult} */ (await cliTool(args));
}

export const toolNames = [
  "zap_agent_ls",
  "zap_agent_render",
  "zap_deploy_agent",
  "zap_session",
  "zap_sessions_ls",
  "zap_secret_list",
];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_agent_ls",
    {
      title: "List Agents",
      description: "List agents-as-code in the current project with their alias pointers.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => agentCliTool(["agent", "ls", "--json"]),
  );

  server.registerTool(
    "zap_agent_render",
    {
      title: "Render Agent",
      description:
        "Deterministically render an agent's instructions and capabilities on CPU. No model call, no spend, secret names only.",
      inputSchema: {
        agent: z.string().describe("Agent id, e.g. transcode."),
        input: z.string().optional().describe("Input text for the render."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ agent, input }) =>
      agentCliTool(["agent", "render", "--agent", agent, ...(input !== undefined ? ["--input", input] : []), "--json"]),
  );

  server.registerTool(
    "zap_deploy_agent",
    {
      title: "Deploy Agents",
      description:
        "Build and register an immutable agents-as-code deployment (advances the development alias; production moves only with an explicit alias).",
      inputSchema: {
        alias: z.string().optional().describe("Alias to move (production requires an existing --sha)."),
        sha: z.string().optional().describe("Existing deployment sha when promoting an alias."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ alias, sha }) =>
      agentCliTool([
        "deploy",
        "--agent",
        ...(alias ? ["--alias", alias] : []),
        ...(sha ? ["--sha", sha] : []),
        "--json",
      ]),
  );

  server.registerTool(
    "zap_session",
    {
      title: "Run Session Turn",
      description:
        "Send one turn to a deployed agent session. Plan-only by default (side-effecting tools are planned, not run); live defaults to false (C5).",
      inputSchema: {
        agent: z.string().optional().describe("Agent id with optional alias, e.g. transcode@production."),
        live: z.boolean().default(false),
        sessionId: z.string().optional().describe("Resume an existing session by id."),
        text: z.string().describe("The turn input text."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ agent, live, sessionId, text }) => {
      if (live) {
        const refusal = await refuseLiveWithoutPayer();
        if (refusal) return /** @type {CallToolResult} */ (refusal);
      }
      const args = ["session"];
      if (agent) args.push("--agent", agent);
      if (sessionId) args.push("--session", sessionId);
      if (live) args.push("--live");
      args.push("--json", text);
      return agentCliTool(args);
    },
  );

  server.registerTool(
    "zap_sessions_ls",
    {
      title: "List Sessions",
      description: "List durable agent sessions with their pinned deployment ids (metadata only).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => agentCliTool(["sessions", "ls", "--json"]),
  );

  server.registerTool(
    "zap_secret_list",
    {
      title: "List Secrets",
      description: "List declared secret names and scopes (last4 only; values are never returned).",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => agentCliTool(["secret", "list", "--json"]),
  );
}
