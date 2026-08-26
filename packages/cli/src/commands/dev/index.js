// @ts-check
import { proxyPackageScript } from "../../lib/project.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "dev",
  summary: "Start the web app dev server",
  usage: "zap dev",
  run({ flags }) {
    proxyPackageScript("dev", flags);
  },
};
