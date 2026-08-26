// @ts-check
import os from "node:os";
import { printJson } from "../../lib/output.js";
import { version } from "../../lib/project.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "info",
  summary: "Print environment info",
  usage: "zap info [--json]",
  run({ flags }) {
    const info = {
      cwd: process.cwd(),
      node: process.versions.node,
      platform: `${os.platform()} ${os.arch()}`,
      version,
    };
    if (flags.json) printJson(info);
    else Object.entries(info).forEach(([key, value]) => console.log(`${key}: ${value}`));
  },
};
