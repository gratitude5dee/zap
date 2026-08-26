// @ts-check
import { printJson } from "../../lib/output.js";
import { parseZapFile, resolveZapFiles, validateSpec } from "../../lib/recipe.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "validate",
  summary: "Validate one or more recipes",
  usage: "zap validate [Zap.md ...] [--json]",
  async run({ args, flags }) {
    const files = await resolveZapFiles(args);
    const results = [];
    for (const file of files) {
      const spec = await parseZapFile(file);
      validateSpec(spec);
      results.push({ file, ok: true, zap: spec.zap });
    }
    if (flags.json) printJson({ results });
    else results.forEach((result) => console.log(`ok ${result.file} (${result.zap})`));
  },
};
