// @ts-check
// Runtime connectivity opt-in tools over `zap runtime connectivity` (§5.10).
// Credentials are never accepted as raw values — only as Box-local file
// paths or via the CLI's env-var fallback — so join keys cannot enter MCP
// transcripts, argv, or logs (C6/C24).
import * as z from "zod/v4";
import { cliTool } from "../tool-helpers.js";

export const toolNames = [
  "zap_runtime_connectivity_status",
  "zap_runtime_connectivity_enable",
  "zap_runtime_connectivity_disable",
];

const FEATURES = /** @type {const} */ (["tailscale", "cotal", "taskrouter", "samMesh"]);

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_runtime_connectivity_status",
    {
      title: "Runtime Connectivity Status",
      description: "Report tailscale/cotal/taskrouter/samMesh status for a runtime (all default off).",
      inputSchema: {
        runtimeId: z.string().describe("Runtime id."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ runtimeId }) => cliTool(["runtime", "connectivity", "status", runtimeId, "--json"]),
  );

  server.registerTool(
    "zap_runtime_connectivity_enable",
    {
      title: "Runtime Connectivity Enable",
      description:
        "Enable one connectivity feature on a runtime. Join credentials are read from files or env vars, never passed as values.",
      inputSchema: {
        feature: z.enum(FEATURES),
        runtimeId: z.string().describe("Runtime id."),
        authKeyFile: z.string().optional().describe("tailscale: path to a file holding the owner's auth key."),
        hostname: z.string().optional().describe("tailscale: device hostname."),
        controlPlane: z.string().optional().describe("samMesh: owner control-plane URL."),
        bootstrapTokenFile: z.string().optional().describe("samMesh: path to a file holding the bootstrap token."),
        meshInviteTokenFile: z.string().optional().describe("samMesh: path to a file holding the mesh invite token."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ feature, runtimeId, authKeyFile, hostname, controlPlane, bootstrapTokenFile, meshInviteTokenFile }) =>
      cliTool([
        "runtime",
        "connectivity",
        "enable",
        runtimeId,
        feature,
        ...(authKeyFile ? ["--auth-key-file", authKeyFile] : []),
        ...(hostname ? ["--hostname", hostname] : []),
        ...(controlPlane ? ["--control-plane", controlPlane] : []),
        ...(bootstrapTokenFile ? ["--bootstrap-token-file", bootstrapTokenFile] : []),
        ...(meshInviteTokenFile ? ["--mesh-invite-token-file", meshInviteTokenFile] : []),
        "--json",
      ]),
  );

  server.registerTool(
    "zap_runtime_connectivity_disable",
    {
      title: "Runtime Connectivity Disable",
      description: "Disable one connectivity feature on a runtime.",
      inputSchema: {
        feature: z.enum(FEATURES),
        runtimeId: z.string().describe("Runtime id."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ feature, runtimeId }) => cliTool(["runtime", "connectivity", "disable", runtimeId, feature, "--json"]),
  );
}
