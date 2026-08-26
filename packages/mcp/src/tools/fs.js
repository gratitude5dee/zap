// @ts-check
// Runtime filesystem tools over `zap fs` (§5.10). zap_fs_read is size-capped
// and text only; zap_fs_write is the only mutating tool here.
import * as z from "zod/v4";
import { cliTool, toolError } from "../tool-helpers.js";

export const toolNames = ["zap_fs_list", "zap_fs_read", "zap_fs_write"];

const MAX_READ_BYTES = 256 * 1024;

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_fs_list",
    {
      title: "Runtime FS List",
      description: "List a directory under a runtime's /zap/fs.",
      inputSchema: {
        path: z.string(),
        runtimeId: z.string(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path, runtimeId }) => cliTool(["fs", "ls", runtimeId, path, "--json"]),
  );

  server.registerTool(
    "zap_fs_read",
    {
      title: "Runtime FS Read",
      description: `Read a text file under a runtime's /zap/fs (capped at ${MAX_READ_BYTES} bytes).`,
      inputSchema: {
        path: z.string(),
        runtimeId: z.string(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path, runtimeId }) => {
      const result = await cliTool(["fs", "read", runtimeId, path, "--json"]);
      const text = result.content[0]?.text ?? "";
      if (Buffer.byteLength(text, "utf8") > MAX_READ_BYTES) {
        return toolError({
          error: {
            code: "FS_READ_TOO_LARGE",
            message: `File exceeds the ${MAX_READ_BYTES}-byte MCP read cap.`,
            remediation: "Read a smaller range with zap fs read, or run zap_sandbox_exec with head/tail.",
          },
        });
      }
      return result;
    },
  );

  server.registerTool(
    "zap_fs_write",
    {
      title: "Runtime FS Write",
      description: "Write a text file under a runtime's /zap/fs.",
      inputSchema: {
        content: z.string(),
        path: z.string(),
        runtimeId: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ content, path, runtimeId }) => cliTool(["fs", "write", runtimeId, path, content, "--json"]),
  );
}
