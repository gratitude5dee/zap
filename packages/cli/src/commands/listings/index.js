// @ts-check
/**
 * `zap listings` — read and improve the staged storefront catalog in the
 * creator's air box. Reads never need credentials; `update` plans by default
 * and only with --live merges the content edits and files a shop_publish
 * decision for the owner. Nothing here charges or changes price/stock.
 */
import { usageError } from "../../lib/errors.js";
import {
  checkListingUpdateGuardrails,
  getListing,
  LISTING_GUARDRAILS,
  loadStagedListings,
  previewListingUpdate,
  searchListings,
  stageListingUpdate,
} from "../../lib/listings.js";
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "listings",
  summary: "Search, audit, and stage content edits to the staged storefront catalog",
  usage: "zap listings <search [query] [--kind k] [--quality]|get <key>|audit|update <key> --set field=value --note \"why\" [--live]> [--json]",
  async run({ args, flags }) {
    const subcommand = args[0] ?? "search";
    const { catalogPath, listings } = await loadStagedListings();

    if (subcommand === "search") {
      const rows = searchListings(listings, {
        kind: typeof flags.kind === "string" ? flags.kind : undefined,
        quality: Boolean(flags.quality),
        query: args.slice(1).join(" "),
      });
      const result = { catalogPath, count: rows.length, listings: rows };
      if (flags.json) printJson(result);
      else if (rows.length === 0) console.log(`No staged listings in ${catalogPath}.`);
      else rows.forEach((row) => console.log(`${row.key}\t${row.kind}\t$${(row.priceCents / 100).toFixed(2)}\t${row.name}${row.findings ? `\t(${row.findings} finding${row.findings === 1 ? "" : "s"})` : ""}`));
      return;
    }

    if (subcommand === "get") {
      const key = args[1];
      if (!key) throw usageError("Usage: zap listings get <key> [--json]");
      const result = { catalogPath, ...getListing(listings, key) };
      if (flags.json) printJson(result);
      else {
        console.log(JSON.stringify(result.listing, null, 2));
        result.findings.forEach((finding) => console.log(`- ${finding.message} → ${finding.fix}`));
      }
      return;
    }

    if (subcommand === "audit") {
      const rows = searchListings(listings, { quality: true });
      const findings = rows.map((row) => ({ ...row, ...getListing(listings, row.key) }));
      const result = { catalogPath, audited: listings.length, flagged: findings.length, listings: findings.map(({ listing, ...rest }) => rest) };
      if (flags.json) printJson(result);
      else if (findings.length === 0) console.log(`Audited ${listings.length} listing(s); nothing to fix.`);
      else {
        for (const entry of findings) {
          console.log(`${entry.key} (${entry.kind}, impact ${entry.impact})`);
          entry.findings.forEach((finding) => console.log(`  - ${finding.message} → ${finding.fix}`));
        }
      }
      return;
    }

    if (subcommand === "update") {
      const key = args[1];
      if (!key) throw usageError(command.usage);
      const items = parseSetFlags(key, flags.set);
      const note = typeof flags.note === "string" ? flags.note : "";
      if (!flags.live) {
        const violations = checkListingUpdateGuardrails(items, listings);
        const result = {
          catalogPath,
          charges: false,
          dryRun: true,
          guardrails: LISTING_GUARDRAILS,
          message: violations.length
            ? "Guardrail violations; nothing would be staged."
            : `Would stage ${items.length} edit(s) on ${key} and file a shop_publish decision. Re-run with --live inside your air box to stage.`,
          note: note || undefined,
          preview: previewListingUpdate(items, listings),
          status: violations.length ? "blocked" : "planned",
          violations,
        };
        if (flags.json) printJson(result);
        else {
          result.preview.forEach((line) => console.log(`${line.target}.${line.field}: ${JSON.stringify(line.before)} → ${JSON.stringify(line.after)}`));
          violations.forEach((violation) => console.log(`blocked: ${violation}`));
          console.log(result.message);
        }
        if (violations.length) process.exitCode = 1;
        return;
      }
      const result = await stageListingUpdate({ items, note });
      if (flags.json) printJson(result);
      else {
        result.preview.forEach((line) => console.log(`${line.target}.${line.field}: ${JSON.stringify(line.before)} → ${JSON.stringify(line.after)}`));
        console.log(result.message + (result.decisionId ? ` Decision ${result.decisionId}.` : ""));
      }
      return;
    }

    throw usageError(command.usage);
  },
};

/**
 * `--set field=value` (repeatable) → change items for one target.
 * @param {string} target
 * @param {unknown} raw
 */
function parseSetFlags(target, raw) {
  const values = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  if (values.length === 0) throw usageError("zap listings update needs at least one --set field=value.");
  return values.map((value) => {
    const text = String(value);
    const separator = text.indexOf("=");
    if (separator <= 0) throw usageError(`--set expects field=value, got ${JSON.stringify(text)}.`);
    return { after: text.slice(separator + 1), before: undefined, field: text.slice(0, separator).trim(), target };
  });
}
