import { defineState } from "eve/context";

export type ListingSnapshot = { description: string; kind: string; name: string };

/**
 * Content fields as `get_listing` last returned them, by lower-cased key.
 * `stage_listing_update` requires a snapshot per target and uses it as the
 * `before` value so an edit proposed against stale copy is refused.
 */
export const catalogReads = defineState("zap.catalogReads", () => ({
  snapshots: {} as Record<string, ListingSnapshot>,
}));

export function recordCatalogRead(listing: { description?: string | null; key: string; kind: string; name: string }) {
  const snapshot: ListingSnapshot = {
    description: listing.description ?? "",
    kind: listing.kind,
    name: listing.name,
  };
  catalogReads.update((current) => ({
    snapshots: { ...current.snapshots, [listing.key.toLowerCase()]: snapshot },
  }));
}
