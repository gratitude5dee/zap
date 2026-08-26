import { createCatalogStub, type CatalogManifest } from "./stub.ts";

export const BASETEN_MANIFEST: CatalogManifest = {
  id: "catalog:baseten",
  name: "Baseten",
  docsUrl: "docs/providers/baseten.md",
  vendorUrl: "https://www.baseten.co",
  kind: "inference",
  verified: false,
  tier: "catalog",
  notes: "Model inference hosting; no sandbox product (verified) — GPU/inference target only.",
};

export const basetenStub = createCatalogStub(BASETEN_MANIFEST);
