// @ts-check
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "feedback",
  summary: "Store local feedback",
  usage: "zap feedback <message> [--json]",
  async run({ args, flags }) {
    const message = args.join(" ").trim();
    if (!message) throw new Error("Usage: zap feedback <message>");
    const dir = path.join(process.cwd(), ".zap");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, "feedback.ndjson"), JSON.stringify({ createdAt: new Date().toISOString(), message }) + "\n");
    if (flags.json) printJson({ ok: true });
    else console.log("Feedback saved locally.");
  },
};
