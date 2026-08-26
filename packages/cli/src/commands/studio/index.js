// @ts-check
import { proxyPackageScript } from "../../lib/project.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "studio",
  summary: "Start the web studio",
  usage: "zap studio",
  run({ flags }) {
    proxyPackageScript("dev", flags, ["--", "--turbo"]);
  },
};
