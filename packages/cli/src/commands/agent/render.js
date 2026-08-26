// @ts-check
import { promises as fs } from "node:fs";
import { usageError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { assertAgentsProject, buildAgentsProject } from "../../lib/agents.js";

/**
 * Deterministic render: runs the agent function in the render guard with a
 * synthetic input and prints `{ instructions, model, tools, mcpServers,
 * subagents, secretsBound }`. Never calls a model or the sandbox.
 * @param {import("../../lib/registry.js").CommandContext} ctx
 */
export async function agentRender(ctx) {
  await assertAgentsProject(ctx.cwd);
  const agentId = typeof ctx.flags.agent === "string" ? ctx.flags.agent : ctx.args[0];
  if (!agentId) throw usageError('Usage: zap agent render --agent <id> [--input "..."|--input-json ...] [--alias a]');
  const alias = typeof ctx.flags.alias === "string" ? ctx.flags.alias : "development";
  const text = typeof ctx.flags.input === "string" ? ctx.flags.input : undefined;
  const payload = typeof ctx.flags.inputJson === "string" ? JSON.parse(ctx.flags.inputJson) : undefined;

  const { loadAgentModulesFromBundle, renderAgent } = await import("@wzrdtech/zap-agent");
  const build = await buildAgentsProject(ctx.cwd, { skipLint: true });
  try {
    const modules = await loadAgentModulesFromBundle(ctx.cwd, `${build.outDir}/bundle.mjs`);
    const loaded = modules[agentId];
    if (!loaded) throw usageError(`Unknown agent "${agentId}". Try zap agent ls.`, "AGENT_NOT_FOUND");
    const rendered = renderAgent(loaded.agent, {
      input: { source: "cli", text, payload, live: false, sessionId: "render", turn: 1, alias },
      sessionData: {},
    });
    const entry = build.manifest.agents[agentId];
    const output = {
      instructions: rendered.instructions,
      model: rendered.capabilities.model,
      tools: [...rendered.capabilities.tools.keys()].sort(),
      mcpServers: [...rendered.capabilities.mcpServers].sort(),
      subagents: [...rendered.capabilities.subagents.keys()].sort(),
      secretsBound: entry ? [...entry.secretsReferenced].sort() : [],
    };
    if (ctx.flags.json) printJson(output);
    else {
      console.log(output.instructions);
      console.log(`model: ${output.model}`);
      if (output.tools.length > 0) console.log(`tools: ${output.tools.join(", ")}`);
      if (output.mcpServers.length > 0) console.log(`mcp: ${output.mcpServers.join(", ")}`);
      if (output.subagents.length > 0) console.log(`subagents: ${output.subagents.join(", ")}`);
      if (output.secretsBound.length > 0) console.log(`secrets: ${output.secretsBound.join(", ")}`);
    }
  } finally {
    await fs.rm(build.outDir, { force: true, recursive: true }).catch(() => {});
  }
}
