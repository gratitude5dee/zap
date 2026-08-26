// @ts-check
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";
import { findResourceRoot } from "../../lib/project.js";
import { registrySkillName, searchRegistryEntries } from "../../lib/registry-entries.js";
import { readAuthStore } from "../../lib/store.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "search",
  summary: "Search registry templates; add --remote for hosted search",
  usage: "zap search <query> [--remote] [--json]",
  async run({ args, flags }) {
    const query = args.join(" ").trim();
    if (!query) throw new Error("Usage: zap search <query> [--remote] [--json]");
    const auth = await readAuthStore();
    const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
    let zaps;
    let source;

    if (flags.remote) {
      const url = new URL(`${apiBase}/api/zaps`);
      url.searchParams.set("query", query);
      const response = await fetch(url);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? `Zap search failed with ${response.status}.`);
      zaps = payload.zaps ?? [];
      source = "remote";
    } else {
      const indexPath = path.join(findResourceRoot(), "registry", "zaps", "index.json");
      const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
      zaps = searchRegistryEntries(index.zaps ?? [], query);
      source = "local";
    }

    if (flags.json) printJson({ query, source, zaps });
    else zaps.forEach((zap) => console.log(`${registrySkillName(zap)} ${zap.title ?? ""} $${Number(zap.budget?.estimate_usd ?? 0).toFixed(2)}`));
  },
};
