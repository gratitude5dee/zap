// @ts-check
// Runtime lifecycle + exec tools over `zap runtime` (§5.10). live:true is
// payer-gated (C5) and never the default.
import * as z from "zod/v4";
import { cliTool, refuseLiveWithoutPayer } from "../tool-helpers.js";

export const toolNames = [
  "zap_runtime_up",
  "zap_runtime_down",
  "zap_runtime_ps",
  "zap_runtime_exec",
  "zap_runtime_snapshot",
  "zap_runtime_fork",
  "zap_sandbox_exec",
];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_runtime_up",
    {
      title: "Runtime Up",
      description: "Create a runtime from Runtime.md or zap.config.ts on the composed sandbox provider.",
      inputSchema: {
        file: z.string().optional().describe("Path to Runtime.md or zap.config.ts."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ file }) => cliTool(["runtime", "up", ...(file ? [file] : []), "--json"]),
  );

  server.registerTool(
    "zap_runtime_down",
    {
      title: "Runtime Down",
      description: "Release a runtime and its sandbox.",
      inputSchema: {
        runtimeId: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ runtimeId }) => cliTool(["runtime", "down", runtimeId, "--json"]),
  );

  server.registerTool(
    "zap_runtime_ps",
    {
      title: "Runtime PS",
      description: "List tracked runtimes.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => cliTool(["runtime", "ps", "--json"]),
  );

  server.registerTool(
    "zap_runtime_exec",
    {
      title: "Runtime Exec",
      description: "Run a command (or a harness prompt) in a runtime. live defaults to false (plan-only, C5).",
      inputSchema: {
        command: z.array(z.string()).optional(),
        live: z.boolean().default(false),
        prompt: z.string().optional(),
        runtimeId: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ command, live, prompt, runtimeId }) => {
      if (live) {
        const refusal = await refuseLiveWithoutPayer();
        if (refusal) return refusal;
      }
      const args = ["runtime", "exec", runtimeId];
      if (prompt !== undefined) args.push("--prompt", prompt);
      if (live) args.push("--live");
      args.push("--json");
      if (command && command.length > 0) args.push("--", ...command);
      return cliTool(args);
    },
  );

  server.registerTool(
    "zap_runtime_snapshot",
    {
      title: "Runtime Snapshot",
      description: "Snapshot a runtime.",
      inputSchema: {
        name: z.string().optional(),
        runtimeId: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ name, runtimeId }) =>
      cliTool(["runtime", "snapshot", runtimeId, ...(name ? ["--name", name] : []), "--json"]),
  );

  server.registerTool(
    "zap_runtime_fork",
    {
      title: "Runtime Fork",
      description: "Fork a runtime into a new one.",
      inputSchema: {
        runtimeId: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ runtimeId }) => cliTool(["runtime", "fork", runtimeId, "--json"]),
  );

  server.registerTool(
    "zap_sandbox_exec",
    {
      title: "Sandbox Exec",
      description: "Run a command in a runtime sandbox, optionally under a named lane. live defaults to false.",
      inputSchema: {
        command: z.array(z.string()).min(1),
        lane: z.string().optional().describe("Lane id, e.g. ffmpeg, codegen, browser, wasm."),
        live: z.boolean().default(false),
        runtimeId: z.string(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ command, lane, live, runtimeId }) => {
      if (live) {
        const refusal = await refuseLiveWithoutPayer();
        if (refusal) return refusal;
      }
      const args = ["runtime", "exec", runtimeId];
      if (lane) args.push("--lane", lane);
      if (live) args.push("--live");
      args.push("--json", "--", ...command);
      return cliTool(args);
    },
  );
}
