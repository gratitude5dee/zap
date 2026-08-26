// @ts-check
import { printJson } from "../../lib/output.js";
import { lintSpec, parseZapFile, resolveZapFiles } from "../../lib/recipe.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "lint",
  summary: "Run recipe policy checks",
  usage: "zap lint [Zap.md ...] [--json]",
  async run({ args, flags }) {
    const files = await resolveZapFiles(args);
    const results = [];
    for (const file of files) {
      const spec = await parseZapFile(file);
      const warnings = lintSpec(spec);
      results.push({ file, ok: warnings.length === 0, warnings, zap: spec.zap });
    }
    if (flags.json) printJson({ results });
    else {
      for (const result of results) {
        console.log(`${result.ok ? "ok" : "warn"} ${result.file} (${result.zap})`);
        result.warnings.forEach((warning) => console.log(`  - ${warning}`));
      }
    }
  },
};
