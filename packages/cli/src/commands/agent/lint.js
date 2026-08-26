// @ts-check
import { printJson } from "../../lib/output.js";
import { assertAgentsProject } from "../../lib/agents.js";

/**
 * The build checks without bundling: secret literals, non-HTTPS origins,
 * process.env reads, async agents, undeclared subagents/MCP servers.
 * @param {import("../../lib/registry.js").CommandContext} ctx
 */
export async function agentLint(ctx) {
  await assertAgentsProject(ctx.cwd);
  const { lintProject } = await import("@wzrdtech/zap-agent");
  const result = await lintProject({ rootDir: ctx.cwd });
  const findings = result.errors;
  if (ctx.flags.json) printJson({ findings, ok: result.errors.length === 0 });
  else if (findings.length === 0) console.log("agent lint: no findings.");
  else for (const issue of findings) console.log(`${issue.code} ${issue.file}: ${issue.message}`);
  if (result.errors.length > 0) process.exitCode = 1;
}
