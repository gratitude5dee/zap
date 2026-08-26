import { describe, expect, it } from "vitest";
import { CATALOG_MANIFESTS, createCatalogStub } from "../../src/adapters/catalog/index.ts";

const EXPECTED_IDS = [
  "catalog:runpod",
  "catalog:blaxel",
  "catalog:freestyle",
  "catalog:orgo",
  "catalog:tensorlake",
  "catalog:baseten",
];

describe("catalog stubs", () => {
  it("exposes a manifest per provider with verified:false and tier catalog", () => {
    expect(CATALOG_MANIFESTS.map((m) => m.id).sort()).toEqual([...EXPECTED_IDS].sort());
    for (const manifest of CATALOG_MANIFESTS) {
      expect(manifest.verified).toBe(false);
      expect(manifest.tier).toBe("catalog");
      expect(manifest.docsUrl).toMatch(/^docs\/providers\/[a-z]+\.md$/);
    }
  });

  it("runpod and baseten are gpu/inference targets, not sandboxes (verified fact)", () => {
    const runpod = CATALOG_MANIFESTS.find((m) => m.id === "catalog:runpod");
    const baseten = CATALOG_MANIFESTS.find((m) => m.id === "catalog:baseten");
    expect(runpod?.kind).not.toBe("sandbox");
    expect(baseten?.kind).not.toBe("sandbox");
  });

  it("acquire() throws CATALOG_STUB with the docs URL", async () => {
    for (const manifest of CATALOG_MANIFESTS) {
      const provider = createCatalogStub(manifest);
      expect(provider.id).toBe(manifest.id);
      await expect(
        provider.acquire({ provider: manifest.id, purpose: "test", idempotencyKey: "k" }),
      ).rejects.toMatchObject({
        code: "CATALOG_STUB",
        message: expect.stringContaining(manifest.docsUrl),
      });
    }
  });

  it("doctor rows are visibly catalog-stub with verified:false", async () => {
    for (const manifest of CATALOG_MANIFESTS) {
      const report = await createCatalogStub(manifest).doctor();
      expect(report.provider).toBe(manifest.id);
      expect(report.ok).toBe(false);
      const stub = report.checks.find((c) => c.id.endsWith(".stub"));
      expect(stub?.detail).toContain("catalog-stub");
      expect(stub?.detail).toContain("verified:false");
      expect(stub?.remediation).toContain(manifest.docsUrl);
    }
  });
});
