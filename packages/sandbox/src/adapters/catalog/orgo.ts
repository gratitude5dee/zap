import { createCatalogStub, type CatalogManifest } from "./stub.ts";

export const ORGO_MANIFEST: CatalogManifest = {
  id: "catalog:orgo",
  name: "Orgo",
  docsUrl: "docs/providers/orgo.md",
  vendorUrl: "https://www.orgo.ai",
  kind: "computer-use",
  verified: false,
  tier: "catalog",
  notes: "Virtual desktops for computer-use agents; desktop-first, not a shell sandbox.",
};

export const orgoStub = createCatalogStub(ORGO_MANIFEST);
