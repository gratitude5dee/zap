// @ts-check
import { printJson } from "../../lib/output.js";
import { assertAgentsProject, listLocalAliases } from "../../lib/agents.js";

/**
 * Lists agents with aliases -> deploymentIds.
 * @param {import("../../lib/registry.js").CommandContext} ctx
 */
export async function agentLs(ctx) {
  await assertAgentsProject(ctx.cwd);
  const { listAgentDirs } = await import("@wzrdtech/zap-agent");
  const agents = await listAgentDirs(ctx.cwd);
  const aliases = await listLocalAliases(ctx.cwd);
  if (ctx.flags.json) {
    printJson({ agents, aliases });
    return;
  }
  for (const agent of agents) console.log(agent);
  for (const [alias, deploymentId] of Object.entries(aliases)) console.log(`${alias} -> ${deploymentId}`);
}
