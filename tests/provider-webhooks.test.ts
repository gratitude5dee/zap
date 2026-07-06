import { describe, expect, it } from "vitest";
import { recordProviderWebhook } from "../lib/provider-webhooks";
import { createRunLedger, getRunSnapshot, upsertStepLedger } from "../lib/run-ledger";

describe("provider webhooks", () => {
  it("records provider completion into the run ledger", async () => {
    const runId = `run_webhook_${Date.now()}`;
    const stepId = "initial_gen";

    await createRunLedger({
      inputs: { prompt: "hello" },
      runId,
      zapSlug: "webhook-demo",
      zapVersion: 1,
    });
    await upsertStepLedger({
      kind: "video.gen",
      model: "fal-ai/kling-video/v2.1/pro/text-to-video",
      priceQuoteUsd: 0.42,
      progress: 0.1,
      provider: "fal",
      providerRequestId: "fal-ai/kling-video/v2.1/pro/text-to-video::req_123",
      runId,
      status: "running",
      stepId,
    });

    const result = await recordProviderWebhook(
      "fal",
      {
        data: {
          video: { url: "mock://provider/req_123.mp4" },
        },
        request_id: "req_123",
        status: "COMPLETED",
      },
      { url: `https://zap.wzrd.tech/api/providers/fal/webhook?runId=${runId}&stepId=${stepId}&capability=video.gen` },
    );

    const snapshot = await getRunSnapshot(runId);
    expect(result.observed).toBe(true);
    expect(snapshot.run?.status).toBe("done");
    expect(snapshot.run?.costUsd).toBe(0.42);
    expect(snapshot.steps.find((step) => step.stepId === stepId)?.status).toBe("done");
    expect(snapshot.assets.some((asset) => asset.stepId === stepId && asset.url === "mock://provider/req_123.mp4")).toBe(true);
  });

  it("does not create orphaned ledger state for unknown runs", async () => {
    const result = await recordProviderWebhook(
      "fal",
      { request_id: "req_missing", status: "COMPLETED" },
      { url: "https://zap.wzrd.tech/api/providers/fal/webhook?runId=run_missing&stepId=initial_gen&capability=video.gen" },
    );

    const snapshot = await getRunSnapshot("run_missing");
    expect(result.observed).toBe(false);
    expect(result.reason).toBe("run_not_found");
    expect(snapshot.steps).toHaveLength(0);
  });
});
