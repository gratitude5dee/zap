import { createCatalogStub, type CatalogManifest } from "./stub.ts";

export const FREESTYLE_MANIFEST: CatalogManifest = {
  id: "catalog:freestyle",
  name: "Freestyle",
  docsUrl: "docs/providers/freestyle.md",
  vendorUrl: "https://freestyle.sh",
  kind: "sandbox",
  verified: false,
  tier: "catalog",
  notes: "Dev-server / code-execution sandboxes for JavaScript; contract mapping unverified.",
};

export const freestyleStub = createCatalogStub(FREESTYLE_MANIFEST);
