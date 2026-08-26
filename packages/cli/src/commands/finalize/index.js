// @ts-check
import { parseCsvFlag } from "../../lib/args.js";
import { printJson } from "../../lib/output.js";
import { readAuthStore } from "../../lib/store.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "finalize",
  summary: "Finalize a deployed draft into the gallery",
  usage: "zap finalize <slug> [--token ...] [--api-url ...] [--json]",
  async run({ args, flags }) {
    const slug = args[0] ?? flags.slug;
    if (!slug) throw new Error("Usage: zap finalize <slug> [--token ...] [--api-url ...]");
    const auth = await readAuthStore();
    const token = String(flags.token ?? auth.token ?? process.env.ZAP_TOKEN ?? "");
    if (!token) throw new Error("zap finalize requires `zap login --token ...`, --token, or ZAP_TOKEN.");
    const apiBase = String(flags.apiUrl ?? auth.apiUrl ?? process.env.ZAP_API_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
    const body = {
      finalizedBy: flags.finalizedBy,
      heroAssetUrl: flags.heroAssetUrl,
      tags: parseCsvFlag(flags.tags),
      title: flags.title,
    };
    const response = await fetch(`${apiBase}/api/zaps/${encodeURIComponent(slug)}/finalize`, {
      body: JSON.stringify(body),
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `Finalize failed with ${response.status}.`);
    if (flags.json) printJson(payload);
    else console.log(`Finalized ${payload.slug ?? slug} on ${apiBase}`);
  },
};
