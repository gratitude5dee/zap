# Runpod (catalog stub)

`catalog:runpod` — GPU pods and serverless inference. **Runpod has no sandbox
product (verified)**: it is documented as a GPU/inference target only. A
Runpod Pods lane adapter is a later spec.

- Tier: `catalog`, `verified:false`.
- `acquire()` throws `CATALOG_STUB` pointing at this page.
- `doctor` lists the stub row so `doctor --json` shows it as `catalog-stub`.
- Manifest: `packages/sandbox/src/adapters/catalog/runpod.ts`.
- Vendor: <https://www.runpod.io>
