// @ts-check
// Media lane tools over `zap ffmpeg` (§5.10). Dry-run by default; live:true
// is payer-gated (C5).
import * as z from "zod/v4";
import { cliTool, refuseLiveWithoutPayer } from "../tool-helpers.js";

export const toolNames = ["zap_ffmpeg_preset"];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_ffmpeg_preset",
    {
      title: "FFmpeg Preset",
      description: "Run an ffmpeg preset in the media lane. Dry-run by default; live:true executes.",
      inputSchema: {
        input: z.string(),
        live: z.boolean().default(false),
        output: z.string().optional(),
        preset: z.string(),
        runtimeId: z.string().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async ({ input, live, output, preset, runtimeId }) => {
      if (live) {
        const refusal = await refuseLiveWithoutPayer();
        if (refusal) return refusal;
      }
      const args = ["ffmpeg", preset, input];
      if (output) args.push(output);
      if (runtimeId) args.push("--runtime", runtimeId);
      if (live) args.push("--live");
      args.push("--json");
      return cliTool(args);
    },
  );
}
