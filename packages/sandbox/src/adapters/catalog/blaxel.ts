import { createCatalogStub, type CatalogManifest } from "./stub.ts";

export const BLAXEL_MANIFEST: CatalogManifest = {
  id: "catalog:blaxel",
  name: "Blaxel",
  docsUrl: "docs/providers/blaxel.md",
  vendorUrl: "https://blaxel.ai",
  kind: "sandbox",
  verified: false,
  tier: "catalog",
  notes: "Hosted sandboxes with fast-boot claims; contract mapping unverified.",
};

export const blaxelStub = createCatalogStub(BLAXEL_MANIFEST);
