// @ts-check
import { printJson } from "../../lib/output.js";
import { assertZapProject } from "../../lib/project.js";
import { scaffoldRecipe } from "./scaffold.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "new",
  summary: "Scaffold agent/skills/zap-<slug>",
  usage: "zap new <slug> [--force] [--json]",
  async run({ args, flags }) {
    assertZapProject(process.cwd());
    const rawSlug = args[0];
    if (!rawSlug) throw new Error("Usage: zap new <slug> [--force]");
    const { skillDir, slug } = await scaffoldRecipe(process.cwd(), rawSlug, flags);
    if (flags.json) printJson({ ok: true, skillDir, slug });
    else console.log(`Created zap-${slug} at ${skillDir}`);
  },
};
