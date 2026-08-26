// @ts-check
/**
 * `zap deploy` for agents-as-code (Z12, §5.12). Flag-only deploys:
 *   zap deploy                       build + register + move `development`
 *   zap deploy --watch               rebuild on change, `development` only
 *   zap deploy --alias production    move `production` to an immutable
 *                                    deployment (no rebuild with --sha)
 * Deployments are immutable and keyed by bundle SHA; open sessions stay
 * pinned to the deployment they were created on.
 */
import { watch } from "node:fs";
import { ZapCliError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { assertAgentsProject, buildAgentsProject, createLocalAgentHost } from "../../lib/agents.js";

/**
 * @param {import("../../lib/registry.js").CommandContext} ctx
 */
export async function run(ctx) {
  const cwd = ctx.cwd ?? process.cwd();
  await assertAgentsProject(cwd);
  const alias = typeof ctx.flags.alias === "string" ? ctx.flags.alias : "development";
  const json = ctx.flags.json === true;

  if (ctx.flags.watch !== undefined) {
    if (alias !== "development") {
      throw new ZapCliError({
        code: "WATCH_DEVELOPMENT_ONLY",
        message: "zap deploy --watch only advances the development alias.",
        remediation: "Promote explicitly with zap deploy --alias production.",
      });
    }
    return watchDeploy(cwd, json);
  }

  const sha = typeof ctx.flags.sha === "string" ? ctx.flags.sha : undefined;
  const { host } = await createLocalAgentHost(cwd);
  if (sha) {
    const deployment = await host.getDeployment(sha);
    if (!deployment) {
      throw new ZapCliError({ code: "DEPLOYMENT_NOT_FOUND", message: `No deployment ${sha}. Deploy first.` });
    }
    const pointer = await host.moveAlias(alias, sha, "cli");
    if (json) printJson({ alias, deploymentId: pointer.deploymentId, ok: true });
    else console.log(`${alias} -> ${pointer.deploymentId}`);
    return;
  }

  const result = await deployOnce(cwd, host, alias);
  if (json) printJson({ alias, deploymentId: result.deploymentId, agents: result.agents, ok: true });
  else console.log(`Deployed ${result.agents.join(", ")}: ${alias} -> ${result.deploymentId}`);
}

/**
 * @param {string} cwd
 * @param {import("@wzrdtech/zap-runtime").AgentHost} host
 * @param {string} alias
 */
async function deployOnce(cwd, host, alias) {
  const build = await buildAgentsProject(cwd);
  const deployment = await host.registerDeployment({ manifest: build.manifest, bundle: build.bundle });
  await host.moveAlias(alias, deployment.id, "cli");
  const { rm } = await import("node:fs/promises");
  await rm(build.outDir, { force: true, recursive: true }).catch(() => {});
  return { deploymentId: deployment.id, agents: Object.keys(build.manifest.agents).sort() };
}

/**
 * @param {string} cwd
 * @param {boolean} json
 */
async function watchDeploy(cwd, json) {
  const { host } = await createLocalAgentHost(cwd);
  const initial = await deployOnce(cwd, host, "development");
  if (json) printJson({ alias: "development", deploymentId: initial.deploymentId, agents: initial.agents, ok: true, watching: true });
  else console.log(`development -> ${initial.deploymentId} (watching for changes, Ctrl+C to stop)`);
  let building = false;
  const trigger = async () => {
    if (building) return;
    building = true;
    try {
      const next = await deployOnce(cwd, host, "development");
      if (json) printJson({ alias: "development", deploymentId: next.deploymentId, agents: next.agents, ok: true });
      else console.log(`development -> ${next.deploymentId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (json) printJson({ ok: false, error: { code: "BUILD_FAILED", message } });
      else console.error(`zap: ${message}`);
    } finally {
      building = false;
    }
  };
  watch(`${cwd}/agents`, { recursive: true }, () => void trigger());
  await new Promise(() => {});
}
