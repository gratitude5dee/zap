// @ts-check
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "upgrade",
  summary: "Print upgrade guidance",
  usage: "zap upgrade [--json]",
  run({ flags }) {
    const message = "Upgrade checks are local in v0.2. Reinstall @wzrdtech/zap or run npm update @wzrdtech/zap to upgrade.";
    if (flags.json) printJson({ message });
    else console.log(message);
  },
};
