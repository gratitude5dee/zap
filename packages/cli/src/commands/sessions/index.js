// @ts-check
/**
 * `zap sessions ls` — list durable agent sessions with their pinned
 * deployment, alias, and last activity (Z12, §5.12).
 */
import { usageError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { assertAgentsProject, createLocalAgentHost } from "../../lib/agents.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "sessions",
  summary: "List durable agent sessions",
  usage: "zap sessions ls [--json]",
  async run(ctx) {
    const [sub] = ctx.args;
    if (sub !== "ls") throw usageError('Unknown sessions subcommand. Try "zap sessions ls".');
    await assertAgentsProject(ctx.cwd);
    const { host } = await createLocalAgentHost(ctx.cwd);
    const sessions = await host.listSessions();
    if (ctx.flags.json) {
      printJson({ sessions });
      return;
    }
    for (const meta of sessions) {
      console.log(`${meta.id} ${meta.agent}@${meta.alias} deployment=${meta.deploymentId.slice(0, 12)} turns=${meta.turns} ${meta.lastActiveAt}`);
    }
  },
};
