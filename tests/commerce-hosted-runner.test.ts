import { describe, expect, it, vi } from "vitest";

const ledger = vi.hoisted(() => ({ createRunLedger: vi.fn(), upsertStepLedger: vi.fn() }));
const meter = vi.hoisted(() => ({ reserveWzrdCloudSpend: vi.fn(), settleWzrdCloudSpend: vi.fn() }));

vi.mock("../lib/run-ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/run-ledger")>()),
  createRunLedger: ledger.createRunLedger,
  upsertStepLedger: ledger.upsertStepLedger,
}));
vi.mock("../lib/wzrd-cloud-meter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/wzrd-cloud-meter")>()),
  reserveWzrdCloudSpend: meter.reserveWzrdCloudSpend,
  settleWzrdCloudSpend: meter.settleWzrdCloudSpend,
}));

import { createZapRunTicket } from "../lib/zap-runner-server";

const inputs = { INVENTORY: 10, PRICE_CENTS: 3500, PRODUCT_NAME: "Neon Wolf", image: "data:image/png;base64,aGVsbG8=" };

describe("hosted runner + commerce steps", () => {
  it("still plans a media + commerce recipe", async () => {
    const result = await createZapRunTicket({ dryRun: true, extendCount: 0, inputs, slug: "merch-drop" });
    expect(result.response.status).toBe("planned");
    expect(result.response.steps.map((step) => step.kind)).toEqual(["image.gen", "commerce.stage_listing"]);
    expect(result.execution).toBeUndefined();
  });

  it("refuses a live media + commerce run before any credential, spend, or ledger work", async () => {
    await expect(
      createZapRunTicket({
        byokSecrets: { fal_key: "fal-test" },
        credentialMode: "byok",
        extendCount: 0,
        inputs,
        live: true,
        slug: "merch-drop",
      }),
    ).rejects.toMatchObject({
      code: "LOCAL_STEP_FAILED",
      message: expect.stringMatching(/stage_listing[^]*No provider work was submitted/),
    });
    expect(ledger.createRunLedger).not.toHaveBeenCalled();
    expect(ledger.upsertStepLedger).not.toHaveBeenCalled();
    expect(meter.reserveWzrdCloudSpend).not.toHaveBeenCalled();
  });
});
