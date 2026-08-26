// @ts-check
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { usageError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";

const USAGE = "zap media <ls|info> [path] [--json]";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "media",
  summary: "Inspect local media outputs under .zap/runs",
  usage: USAGE,
  async run({ args, flags }) {
    const [subcommand = "ls", target] = args;
    const runsDir = path.join(process.cwd(), ".zap", "runs");
    if (subcommand === "ls") {
      const assets = [];
      if (existsSync(runsDir)) {
        for (const run of await fs.readdir(runsDir)) {
          const assetsDir = path.join(runsDir, run, "assets");
          if (!existsSync(assetsDir)) continue;
          for (const file of await fs.readdir(assetsDir)) {
            const stat = await fs.stat(path.join(assetsDir, file));
            assets.push({ bytes: stat.size, file: path.join(".zap", "runs", run, "assets", file), runId: run });
          }
        }
      }
      if (flags.json) printJson({ assets });
      else assets.forEach((asset) => console.log(`${asset.runId} ${asset.file} ${asset.bytes}B`));
      return;
    }
    if (subcommand === "info") {
      if (!target) throw usageError(`Usage: ${USAGE}`);
      const file = path.resolve(process.cwd(), target);
      const stat = await fs.stat(file);
      const info = { bytes: stat.size, ext: path.extname(file).slice(1), file, modifiedAt: stat.mtime.toISOString() };
      if (flags.json) printJson(info);
      else console.log(`${info.file} ${info.ext} ${info.bytes}B ${info.modifiedAt}`);
      return;
    }
    throw usageError(`Usage: ${USAGE}`);
  },
};
