// @ts-check
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { usageError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";

const USAGE = "zap template <ls|show> [name] [--json]";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "template",
  summary: "List or show runtime templates under .zap/templates",
  usage: USAGE,
  async run({ args, flags }) {
    const [subcommand = "ls", name] = args;
    const templatesDir = path.join(process.cwd(), ".zap", "templates");
    if (subcommand === "ls") {
      const templates = existsSync(templatesDir)
        ? (await fs.readdir(templatesDir)).filter((file) => file.endsWith(".json")).map((file) => file.replace(/\.json$/, ""))
        : [];
      if (flags.json) printJson({ templates });
      else templates.forEach((template) => console.log(template));
      return;
    }
    if (subcommand === "show") {
      if (!name) throw usageError(`Usage: ${USAGE}`);
      const file = path.join(templatesDir, `${name}.json`);
      if (!existsSync(file)) throw new Error(`Template ${name} was not found under .zap/templates.`);
      const template = JSON.parse(await fs.readFile(file, "utf8"));
      if (flags.json) printJson(template);
      else console.log(JSON.stringify(template, null, 2));
      return;
    }
    throw usageError(`Usage: ${USAGE}`);
  },
};
