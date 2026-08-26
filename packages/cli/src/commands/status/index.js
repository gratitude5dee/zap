// @ts-check
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "status",
  summary: "Show local run status",
  usage: "zap status [runId] [--json]",
  async run({ args, flags }) {
    const runId = args[0];
    const runsDir = path.join(process.cwd(), ".zap", "runs");
    if (runId) {
      const file = path.join(runsDir, runId, "result.json");
      const result = JSON.parse(await fs.readFile(file, "utf8"));
      if (flags.json) printJson(result);
      else console.log(`${result.runId} ${result.status} ${result.zapUrl ?? ""}`.trim());
      return;
    }
    const runs = existsSync(runsDir) ? await fs.readdir(runsDir) : [];
    if (flags.json) printJson({ runs });
    else runs.forEach((run) => console.log(run));
  },
};
