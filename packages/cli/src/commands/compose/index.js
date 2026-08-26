// @ts-check
import { loadRuntimeSpecFromFile, resolveComposeTree, resolveRuntimeDefinition } from "../../lib/compose.js";
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "compose",
  summary: "Resolve Runtime.md or zap.config.ts into the runtime plugin tree",
  usage: "zap compose [Runtime.md|zap.config.ts] [--dry-run] [--json]",
  async run({ args, flags }) {
    const file = resolveRuntimeDefinition(process.cwd(), args[0]);
    const { source, spec } = await loadRuntimeSpecFromFile(file);
    const tree = resolveComposeTree(spec);
    const result = {
      dryRun: Boolean(flags.dryRun),
      entries: tree.entries,
      file,
      lock: tree.lock,
      ok: true,
      runtime: tree.runtime,
      sandbox: tree.sandbox,
      source,
      weight: tree.weight,
    };
    if (flags.dryRun) {
      result.quote = {
        currency: "USD",
        lines: tree.entries.map((entry) => ({ entryId: entry.entryId, estimateUsd: 0 })),
        mode: "plan",
        totalUsd: 0,
      };
    }
    if (flags.json) {
      printJson(result);
      return;
    }
    console.log(`${tree.runtime} v${tree.version} (${tree.weight}, sandbox: ${tree.sandbox}) lock ${tree.lock}`);
    for (const entry of tree.entries) console.log(`  ${entry.entryId}`);
    if (flags.dryRun) console.log("dry-run: $0.00 quoted, nothing acquired");
  },
};
