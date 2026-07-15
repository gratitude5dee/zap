import { afterEach, describe, expect, it, vi } from "vitest";
import { gmiAdapter } from "../packages/providers/src/gmi.ts";

const gmiRequestsUrl = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests";

afterEach(() => {
  vi.restoreAllMocks();
});

function videoRequest(overrides: Partial<Parameters<typeof gmiAdapter.submit>[0]> = {}) {
  return {
    capability: "video.gen" as const,
    durationS: 15,
    inputs: {
      firstFrameUrl: "https://assets.example/first-frame.jpg",
    },
    model: "seedance-2-0-fast-260128",
    prompt: "A hummingbird in a moonlit garden",
    provider: "gmi" as const,
    runId: "run_air",
    secrets: { gmi_api_key: "gmi-test-key" },
    stepId: "video",
    ...overrides,
  };
}

describe("GMI Seedance provider", () => {
  it("uses only a GMI API key and defaults video generation to Seedance Fast", async () => {
    expect(gmiAdapter.secretTypes).toEqual(["gmi_api_key"]);
    expect(gmiAdapter.defaultModel("video.gen")).toBe("seedance-2-0-fast-260128");
    await expect(gmiAdapter.validateKey({ gmi_api_key: "gmi-test-key" })).resolves.toEqual({ ok: true, provider: "gmi" });
  });

  it("submits the Seedance Fast launch preset through the requestqueue API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ request_id: "gmi_req_123" }), { status: 200 }));

    await expect(gmiAdapter.submit(videoRequest(), "zap:idem:ignored")).resolves.toEqual({
      provider: "gmi",
      requestId: "gmi_req_123",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(gmiRequestsUrl);
    expect(init).toMatchObject({
      headers: {
        authorization: "Bearer gmi-test-key",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect((init as RequestInit).headers).toEqual({
      authorization: "Bearer gmi-test-key",
      "content-type": "application/json",
    });
    expect((init as RequestInit).signal).toBeDefined();
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      model: "seedance-2-0-fast-260128",
      payload: {
        duration: 5,
        first_frame: "https://assets.example/first-frame.jpg",
        generate_audio: true,
        prompt: "A hummingbird in a moonlit garden",
        ratio: "adaptive",
        resolution: "720p",
        seed: null,
        watermark: false,
        web_search: false,
      },
    });
  });

  it("polls the request path and returns the completed video URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      outcome: { video_url: "https://storage.googleapis.com/gmi/video.mp4" },
      status: "success",
    }), { status: 200 }));

    await expect(gmiAdapter.poll("gmi request/123", { gmi_api_key: "gmi-test-key" })).resolves.toEqual({
      error: undefined,
      outputUrl: "https://storage.googleapis.com/gmi/video.mp4",
      progress: 1,
      status: "done",
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${gmiRequestsUrl}/gmi%20request%2F123`);
    expect(init).toMatchObject({
      headers: { authorization: "Bearer gmi-test-key" },
    });
    expect((init as RequestInit).signal).toBeDefined();
  });

  it("maps processing, media_urls, failed, and cancelled responses safely", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "processing" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        outcome: { media_urls: [{ url: "https://storage.googleapis.com/gmi/fallback.mp4" }] },
        status: "success",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "generation failed", status: "failed" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "cancelled by provider", status: "cancelled" }), { status: 200 }));

    await expect(gmiAdapter.poll("processing", { gmi_api_key: "gmi-test-key" })).resolves.toMatchObject({ progress: 0.5, status: "running" });
    await expect(gmiAdapter.poll("media", { gmi_api_key: "gmi-test-key" })).resolves.toMatchObject({
      outputUrl: "https://storage.googleapis.com/gmi/fallback.mp4",
      status: "done",
    });
    await expect(gmiAdapter.poll("failed", { gmi_api_key: "gmi-test-key" })).resolves.toMatchObject({
      error: "PROVIDER_FAILED",
      status: "failed",
    });
    await expect(gmiAdapter.poll("cancelled", { gmi_api_key: "gmi-test-key" })).resolves.toMatchObject({
      error: "PROVIDER_REJECTED",
      status: "failed",
    });
  });

  it("does not expose provider response bodies or transport diagnostics", async () => {
    const sensitivePrompt = "an unreleased family photo in a secret room";
    const sensitiveUrl = "https://storage.googleapis.com/gmi/first-frame.jpg?signature=private";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: `${sensitivePrompt} ${sensitiveUrl}` }), { status: 400 }))
      .mockRejectedValueOnce(new Error(`${sensitivePrompt} ${sensitiveUrl}`));

    const httpError = await gmiAdapter.submit(videoRequest({ prompt: sensitivePrompt }), "zap:idem:ignored")
      .then(() => undefined, (error: unknown) => error);
    const transportError = await gmiAdapter.poll("transport", { gmi_api_key: "gmi-test-key" })
      .then(() => undefined, (error: unknown) => error);

    expect(httpError).toMatchObject({ code: "PROVIDER_ERROR", message: "gmi request failed with HTTP 400." });
    expect(transportError).toMatchObject({ code: "PROVIDER_ERROR", message: "gmi request unavailable.", retryable: true });
    const messages = [httpError, transportError]
      .map((error) => error instanceof Error ? error.message : String(error))
      .join("\n");
    expect(messages).not.toContain(sensitivePrompt);
    expect(messages).not.toContain(sensitiveUrl);
  });
});
