// @ts-check
/**
 * `zap agent` — agents-as-code developer commands (Z12, §5.12):
 *   zap agent new <id>       scaffold agents/<id>/ and register it in project.ts
 *   zap agent ls             list agents with aliases -> deploymentIds
 *   zap agent render         deterministic render (no model, no sandbox)
 *   zap agent lint           the build checks without bundling
 */
import { usageError } from "../../lib/errors.js";
import { agentNew } from "./new.js";
import { agentLs } from "./ls.js";
import { agentRender } from "./render.js";
import { agentLint } from "./lint.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "agent",
  summary: "Scaffold, list, render, and lint agents-as-code",
  usage: "zap agent <new|ls|render|lint> [--json]",
  async run(ctx) {
    const [sub, ...rest] = ctx.args;
    const next = { ...ctx, args: rest };
    if (sub === "new") return agentNew(next);
    if (sub === "ls") return agentLs(next);
    if (sub === "render") return agentRender(next);
    if (sub === "lint") return agentLint(next);
    throw usageError(`Unknown agent subcommand "${sub ?? ""}". Try: new, ls, render, lint.`);
  },
};
