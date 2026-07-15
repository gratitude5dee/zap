import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("../lib/air-video-service");
  vi.doUnmock("../lib/blob-store");
  vi.doUnmock("../lib/redis");
  vi.doUnmock("../lib/run-ledger");
  vi.doUnmock("@wzrdtech/providers");
  vi.resetModules();
});

describe("provider webhook redaction", () => {
  it("never persists a failed provider payload, prompt, signed first-frame URL, or callback secret", async () => {
    const state = {
      failure: vi.fn(),
      lpush: vi.fn(),
      release: vi.fn(),
      snapshot: {
        assets: [] as Array<Record<string, unknown>>,
        run: { costUsd: 0, status: "running" },
        steps: [{ kind: "video.gen", priceQuoteUsd: 1, progress: 0.5, status: "running", stepId: "seedance" }] as Array<Record<string, unknown>>,
      },
      updateRun: vi.fn(),
      upsert: vi.fn(),
    };
    const runId = "air_abcdef012345abcdef012345";
    const privatePrompt = "make a secret portrait of my family";
    const firstFrameUrl = "https://storage.googleapis.com/gmi/first-frame.jpg?signature=private";
    const webhookSecret = "webhook-secret-must-not-persist";

    vi.resetModules();
    vi.doMock("../lib/blob-store", () => ({
      AirVideoOutputError: class AirVideoOutputError extends Error {},
      persistAirVideoOutput: vi.fn(),
    }));
    vi.doMock("../lib/air-video-service", () => ({
      recordAirVideoAssetExpiry: vi.fn(),
      recordAirVideoFailure: (...args: unknown[]) => state.failure(...args),
      releaseAirVideoConcurrency: (...args: unknown[]) => state.release(...args),
      scheduleAirVideoAssetCleanup: vi.fn(),
      touchAirVideoConcurrency: vi.fn(),
    }));
    vi.doMock("../lib/redis", () => ({
      getRedis: () => ({
        lpush: (...args: unknown[]) => state.lpush(...args),
        set: async () => "OK",
      }),
    }));
    vi.doMock("../lib/run-ledger", () => ({
      addAssetLedger: vi.fn(),
      getRunSnapshot: async () => ({ ...state.snapshot }),
      updateRunLedger: (...args: unknown[]) => state.updateRun(...args),
      upsertStepLedger: (...args: unknown[]) => state.upsert(...args),
    }));
    vi.doMock("@wzrdtech/providers", () => ({
      ProviderError: class ProviderError extends Error {},
      defaultModelFor: vi.fn(),
      getProviderAdapter: () => ({}),
      listProviderAdapters: () => [],
    }));

    const { recordProviderWebhook } = await import("../lib/provider-webhooks");
    await expect(recordProviderWebhook("gmi", {
      error: `Rejected: ${privatePrompt}; first frame ${firstFrameUrl}`,
      payload: {
        first_frame: firstFrameUrl,
        prompt: privatePrompt,
      },
      request_id: "gmi_request_123",
      status: "failed",
    }, {
      url: `https://zap.wzrd.tech/providers/gmi/webhook?runId=${runId}&stepId=seedance&capability=video.gen&secret=${webhookSecret}`,
    })).resolves.toMatchObject({ observed: true, status: "failed" });

    expect(state.lpush).toHaveBeenCalledWith("zap:webhook:gmi", expect.any(String));
    const queued = JSON.parse(String(state.lpush.mock.calls[0]?.[1]));
    expect(queued).toMatchObject({
      capability: "video.gen",
      errorCode: "PROVIDER_FAILED",
      event: "provider_progress",
      hasOutput: false,
      provider: "gmi",
      runId,
      status: "failed",
      stepId: "seedance",
    });
    expect(queued).not.toHaveProperty("payload");
    expect(queued).not.toHaveProperty("sourceUrl");

    const durableWrites = JSON.stringify({
      airFailure: state.failure.mock.calls,
      queue: state.lpush.mock.calls,
      run: state.updateRun.mock.calls,
      step: state.upsert.mock.calls,
    });
    expect(durableWrites).not.toContain(privatePrompt);
    expect(durableWrites).not.toContain(firstFrameUrl);
    expect(durableWrites).not.toContain(webhookSecret);
    expect(state.failure).toHaveBeenCalledWith(runId, "PROVIDER_FAILED");
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({ error: "PROVIDER_FAILED" }));
    expect(state.updateRun).toHaveBeenCalledWith(expect.objectContaining({ error: "PROVIDER_FAILED" }));
  });
});
