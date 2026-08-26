// @ts-check
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "telemetry",
  summary: "Manage local telemetry preference",
  usage: "zap telemetry [on|off|status] [--json]",
  async run({ args, flags }) {
    const value = args[0] ?? "status";
    const dir = path.join(process.cwd(), ".zap");
    const file = path.join(dir, "telemetry.json");
    await fs.mkdir(dir, { recursive: true });
    if (value === "on" || value === "off") {
      await fs.writeFile(file, JSON.stringify({ enabled: value === "on" }, null, 2) + "\n");
    }
    const enabled = existsSync(file) ? JSON.parse(await fs.readFile(file, "utf8")).enabled : false;
    if (flags.json) printJson({ enabled });
    else console.log(`Telemetry ${enabled ? "on" : "off"}`);
  },
};
