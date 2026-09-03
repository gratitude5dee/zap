import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadStagedListings, searchListings } from "../../packages/cli/src/lib/listings.js";

export default defineTool({
  description:
    "Search the creator's staged storefront catalog (the air box catalog.json). Returns summary rows only; read a record with get_listing before proposing an edit. Empty query with quality=true starts a content audit. Read-only, no credentials, never charges.",
  inputSchema: z.object({
    kind: z.enum(["physical", "digital", "service", "event_ticket"]).optional(),
    quality: z.boolean().default(false),
    query: z.string().default(""),
  }),
  async execute(input) {
    const { catalogPath, listings } = await loadStagedListings();
    const rows = searchListings(listings, input);
    return { catalogPath, count: rows.length, listings: rows, total: listings.length };
  },
  toModelOutput(output) {
    if (output.total === 0) {
      return {
        type: "text",
        value: `No staged listings at ${output.catalogPath}. This host is not the creator's air box, or no Zap has staged a listing yet; run merch-drop or event-ticket with --live inside the box first.`,
      };
    }
    const lines = output.listings.map((row) =>
      `${row.key} | ${row.kind} | $${(row.priceCents / 100).toFixed(2)} | ${row.name}${row.findings ? ` | ${row.findings} finding(s), impact ${row.impact}` : ""}`,
    );
    return { type: "text", value: `${output.count} of ${output.total} listing(s):\n${lines.join("\n")}` };
  },
});
