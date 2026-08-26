// @ts-check
import { spawnSync } from "node:child_process";
import { usageError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { requirePayer } from "../../lib/payer.js";
import { hasExecutable } from "../../lib/project.js";

const PRESETS = {
  "extract-audio": (input, output) => ["-i", input, "-vn", "-acodec", "copy", output],
  gif: (input, output) => ["-i", input, "-vf", "fps=12,scale=480:-1:flags=lanczos", output],
  "social-9x16": (input, output) => ["-i", input, "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "-c:a", "copy", output],
  thumbnail: (input, output) => ["-i", input, "-frames:v", "1", output],
};

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "ffmpeg",
  summary: "Plan (default) or run ffmpeg presets against local media",
  usage: "zap ffmpeg <preset> <input> <output> [--live] [--json]",
  async run({ args, flags }) {
    const [preset, input, output] = args;
    const builder = preset === undefined ? undefined : PRESETS[preset];
    if (!builder || !input || !output) {
      throw usageError(`Usage: zap ffmpeg <${Object.keys(PRESETS).join("|")}> <input> <output> [--live] [--json]`);
    }
    const argv = builder(input, output);
    const plan = { args: ["ffmpeg", "-y", ...argv], input, mode: flags.live ? "live" : "plan", output, preset };
    if (!flags.live) {
      if (flags.json) printJson({ ...plan, executed: false, ok: true });
      else console.log(`plan: ${plan.args.join(" ")}`);
      return;
    }
    await requirePayer("zap ffmpeg --live");
    if (!hasExecutable("ffmpeg")) throw new Error("ffmpeg is not installed or not on PATH.");
    const result = spawnSync("ffmpeg", ["-y", ...argv], { stdio: flags.json ? "pipe" : "inherit" });
    const ok = result.status === 0;
    if (flags.json) printJson({ ...plan, executed: true, exitCode: result.status ?? 1, ok });
    if (!ok) process.exitCode = 1;
  },
};
