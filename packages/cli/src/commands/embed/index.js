// @ts-check
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "embed",
  summary: "Print iframe/oEmbed embed snippets",
  usage: "zap embed <slug> [--base-url https://zap.wzrd.tech] [--json]",
  async run({ args, flags }) {
    const slug = args[0] ?? flags.slug;
    if (!slug) throw new Error("Usage: zap embed <slug> [--base-url https://zap.wzrd.tech] [--json]");
    const baseUrl = String(flags.baseUrl ?? process.env.ZAP_PUBLIC_ORIGIN ?? process.env.ZAP_PUBLIC_BASE_URL ?? "https://zap.wzrd.tech").replace(/\/$/, "");
    const iframe = `<iframe src="${baseUrl}/embed/${slug}" width="1280" height="720" loading="lazy" allow="clipboard-write; fullscreen"></iframe>`;
    const oembed = `${baseUrl}/api/oembed?url=${encodeURIComponent(`${baseUrl}/${slug}`)}`;
    if (flags.json) printJson({ iframe, oembed, slug });
    else console.log(iframe);
  },
};
