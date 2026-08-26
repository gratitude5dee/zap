// @ts-check
import { printJson } from "../../lib/output.js";
import { titleize } from "../../lib/project.js";
import { parseZapFile, resolveZapFiles } from "../../lib/recipe.js";
import { registrySlug } from "../../lib/registry-entries.js";
import { readAuthStore } from "../../lib/store.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "gallery",
  summary: "List local recipes; add --remote for hosted gallery",
  usage: "zap gallery [--remote] [--json]",
  async run({ args, flags }) {
    const auth = await readAuthStore();
    const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
    if (flags.remote) {
      const response = await fetch(`${apiBase}/api/zaps`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? `Gallery request failed with ${response.status}.`);
      if (flags.json) printJson(payload);
      else (payload.zaps ?? []).forEach((zap) => console.log(`${registrySlug(zap)} ${zap.title ?? ""} $${Number(zap.budget?.estimate_usd ?? 0).toFixed(2)}`));
      return;
    }

    const files = await resolveZapFiles(args);
    const zaps = [];
    for (const file of files) {
      const spec = await parseZapFile(file);
      zaps.push({
        estimateUsd: spec.budget.estimate_usd,
        file,
        slug: spec.zap,
        steps: spec.steps.length,
        title: titleize(spec.zap),
      });
    }
    if (flags.json) printJson({ zaps });
    else zaps.forEach((zap) => console.log(`${zap.slug} ${zap.steps} step(s) $${zap.estimateUsd.toFixed(2)} ${zap.file}`));
  },
};
