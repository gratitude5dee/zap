import { defineState } from "eve/context";

/** Keys whose full record `get_listing` returned this session; `stage_listing_update` requires one per target. */
export const catalogReads = defineState("zap.catalogReads", () => ({
  keys: [] as string[],
}));

export function recordCatalogRead(key: string) {
  catalogReads.update((current) => ({
    keys: current.keys.includes(key) ? current.keys : [...current.keys, key],
  }));
}
