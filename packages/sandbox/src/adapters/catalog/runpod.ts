import { createCatalogStub, type CatalogManifest } from "./stub.ts";

export const RUNPOD_MANIFEST: CatalogManifest = {
  id: "catalog:runpod",
  name: "Runpod",
  docsUrl: "docs/providers/runpod.md",
  vendorUrl: "https://www.runpod.io",
  kind: "gpu",
  verified: false,
  tier: "catalog",
  notes:
    "GPU pods and serverless inference; no sandbox product (verified) — a Runpod Pods lane adapter is a later spec.",
};

export const runpodStub = createCatalogStub(RUNPOD_MANIFEST);
