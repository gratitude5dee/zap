// @ts-check
import { promises as fs } from "node:fs";
import path from "node:path";
import { ZapCliError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { bundleZapSource, parseZapFile, resolveZapFiles } from "../../lib/recipe.js";
import { readAuthStore } from "../../lib/store.js";

const AGENT_FLAGS = ["watch", "alias", "agent", "all"];

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "deploy",
  summary: "Upload a draft Zap to the hosted API",
  usage: "zap deploy <slug|Zap.md> [--finalize] [--json]",
  async run({ args, flags }) {
    if (args.length === 0 && AGENT_FLAGS.some((flag) => flags[flag] !== undefined)) {
      return deployAgent({ args, flags });
    }
    const file = (await resolveZapFiles(args))[0];
    if (!file) throw new Error("Usage: zap deploy <slug|Zap.md> [--finalize] [--json]");
    const spec = await parseZapFile(file);
    const auth = await readAuthStore();
    const token = String(flags.token ?? auth.token ?? process.env.ZAP_TOKEN ?? "");
    const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
    const body = await bundleZapSource(file, spec);
    body.finalize = Boolean(flags.finalize);
    body.status = flags.finalize ? "published" : "draft";
    if (!token) {
      const dir = path.join(process.cwd(), ".zap", "deployments");
      await fs.mkdir(dir, { recursive: true });
      const target = path.join(dir, `${spec.zap}.json`);
      await fs.writeFile(target, JSON.stringify(body, null, 2) + "\n");
      if (flags.json) printJson({ file: target, ok: true, offline: true, slug: spec.zap });
      else console.log(`Prepared offline ${body.status} deployment ${target}`);
      return;
    }
    const response = await fetch(`${apiBase}/api/zaps/publish`, {
      body: JSON.stringify(body),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `Deploy failed with ${response.status}.`);
    if (flags.json) printJson(payload);
    else console.log(`${payload.status === "published" ? "Finalized" : "Deployed draft"} ${payload.slug ?? spec.zap} at ${apiBase}/${payload.slug ?? spec.zap}`);
  },
};

/**
 * Flag-only agent deploy dispatches to the agents-as-code deployer
 * (`commands/deploy/agent.js`, Z12). Until that module lands, reports
 * AGENTS_NOT_AVAILABLE.
 * @param {import("../../lib/registry.js").CommandContext} ctx
 */
async function deployAgent(ctx) {
  let agent;
  try {
    agent = await import("./agent.js");
  } catch (error) {
    const code = /** @type {{ code?: string }} */ (error).code;
    if (code !== "ERR_MODULE_NOT_FOUND") throw error;
    throw new ZapCliError({
      code: "AGENTS_NOT_AVAILABLE",
      message: "AGENTS_NOT_AVAILABLE: agents-as-code deploy ships in Z12. This build only deploys Zap recipes.",
      remediation: "Deploy a recipe with zap deploy <slug|Zap.md>, or upgrade once agents-as-code lands (Z12).",
    });
  }
  return agent.run(ctx);
}
