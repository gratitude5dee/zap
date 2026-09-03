import { defineTool } from "eve/tools";
import { z } from "zod";
import { getListing, loadStagedListings } from "../../packages/cli/src/lib/listings.js";
import { recordCatalogRead } from "../lib/catalog-reads.js";

export default defineTool({
  description:
    "Fetch one staged listing's full record (name, description, kind, price, inventory, image, source Zap) plus its content-quality findings. Required before stage_listing_update on that key. Read-only, never charges.",
  inputSchema: z.object({ key: z.string().min(1) }),
  async execute({ key }) {
    const { catalogPath, listings } = await loadStagedListings();
    const result = getListing(listings, key);
    recordCatalogRead(result.listing);
    return { catalogPath, ...result };
  },
  toModelOutput(output) {
    const findings = output.findings.length
      ? output.findings.map((finding) => `- ${finding.message} → ${finding.fix}`).join("\n")
      : "- no content findings";
    return {
      type: "text",
      value: `${JSON.stringify(output.listing, null, 2)}\nFindings:\n${findings}\nprice and inventory come from the Zap inputs; only name, description, and kind are content edits.`,
    };
  },
});
