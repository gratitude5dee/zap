// @ts-check
import { existsSync } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";
import { assertZapProject, copyDir, findResourceRoot, slugify } from "../../lib/project.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "add",
  summary: "Add a registry Zap",
  usage: "zap add <registry-name> [--force] [--json]",
  async run({ args, flags }) {
    assertZapProject(process.cwd());
    const name = args[0];
    if (!name) throw new Error("Usage: zap add <registry-name>");
    const normalizedName = name.startsWith("zap-") ? name : `zap-${slugify(name)}`;
    const registryDir = path.join(findResourceRoot(), "registry", "zaps", normalizedName);
    const targetDir = path.join(process.cwd(), "agent", "skills", normalizedName);
    if (!existsSync(registryDir)) throw new Error(`Registry entry ${name} was not found.`);
    await copyDir(registryDir, targetDir, Boolean(flags.force));
    if (flags.json) printJson({ ok: true, targetDir });
    else console.log(`Added ${name} to ${targetDir}`);
  },
};
