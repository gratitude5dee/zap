import { createCatalogStub, type CatalogManifest } from "./stub.ts";

export const TENSORLAKE_MANIFEST: CatalogManifest = {
  id: "catalog:tensorlake",
  name: "Tensorlake",
  docsUrl: "docs/providers/tensorlake.md",
  vendorUrl: "https://www.tensorlake.ai",
  kind: "document",
  verified: false,
  tier: "catalog",
  notes: "Document ingestion / data workflows; not a general-purpose sandbox.",
};

export const tensorlakeStub = createCatalogStub(TENSORLAKE_MANIFEST);
