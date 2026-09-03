import { defineTool } from "eve/tools";
import { z } from "zod";
import { ZapRunError } from "../../lib/zap-errors.js";
import { LISTING_GUARDRAILS, stageListingUpdate } from "../../packages/cli/src/lib/listings.js";
import { catalogReads, type ListingSnapshot, recordCatalogRead } from "../lib/catalog-reads.js";

const changeItem = z.object({
  after: z.union([z.string(), z.enum(["physical", "digital", "service", "event_ticket"])]),
  field: z.enum(["name", "description", "kind"]),
  target: z.string().min(1),
});

export default defineTool({
  description:
    "Stage content edits (name, description, kind) to listings the creator has already read with get_listing this session. Merges the edits into the box catalog and files a shop_publish decision the owner approves in air; the storefront changes only after that approval. Price and inventory are not editable here (re-run the Zap). Never charges. Use dryRun to preview the diff and guardrail result without writing.",
  inputSchema: z.object({
    dryRun: z.boolean().default(false),
    items: z.array(changeItem).min(1).max(LISTING_GUARDRAILS.maxItemsPerChange),
    note: z.string().min(1).describe("Why the change is right; shown to the owner with the preview."),
  }),
  approval: ({ toolInput }) => {
    const input = toolInput as { dryRun?: boolean } | undefined;
    return input?.dryRun ? "not-applicable" : "user-approval";
  },
  async execute(input) {
    const { snapshots } = catalogReads.get();
    const unread = [...new Set(input.items.map((item) => item.target.toLowerCase()))].filter((key) => !snapshots[key]);
    if (unread.length) {
      throw new ZapRunError({
        code: "INVALID_INPUT",
        message: `Read ${unread.join(", ")} with get_listing before staging an edit; a proposal must rest on the record, not the search row.`,
        remediation: "Call get_listing for each target, then stage again with the same items.",
        retryable: true,
      });
    }
    const items = input.items.map((item) => ({ ...item, before: snapshots[item.target.toLowerCase()][item.field] }));
    const result = await stageListingUpdate({ ...input, items, snapshots });
    if (!result.dryRun) {
      const refreshed: Record<string, ListingSnapshot> = {};
      for (const item of items) {
        const key = item.target.toLowerCase();
        refreshed[key] = { ...(refreshed[key] ?? snapshots[key]), [item.field]: item.field === "name" ? item.after.trim() : item.after };
      }
      for (const [key, snapshot] of Object.entries(refreshed)) recordCatalogRead({ key, ...snapshot });
    }
    return result;
  },
  toModelOutput(output) {
    const diff = output.preview.map((line) => `${line.target}.${line.field}: ${JSON.stringify(line.before)} → ${JSON.stringify(line.after)}`).join("\n");
    const decision = "decisionId" in output && output.decisionId ? ` Decision ${output.decisionId}.` : "";
    return { type: "text", value: `${output.status}: ${output.message}${decision}\n${diff}\nNothing was charged.` };
  },
});
