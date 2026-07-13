import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  close: vi.fn(() => Promise.resolve()),
  onUpdate: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexClient: vi.fn(function ConvexClient() {
    return { close: mocks.close, onUpdate: mocks.onUpdate };
  }),
}));
vi.mock("../lib/convex-service", () => ({ convexServiceToken: () => "service-token" }));
vi.mock("../lib/supabase/server", () => ({
  getRequestAccessToken: () => "access-token",
  resolveWalletPrincipal: () => Promise.resolve({ principalId: "wallet:0x123" }),
}));

import { GET } from "../app/api/studio/runs/stream/route";
import { STUDIO_RUN_STREAM_LIFETIME_MS } from "../lib/studio-runs";

describe("Studio run SSE route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T00:00:00Z"));
    vi.stubEnv("CONVEX_URL", "https://example.convex.cloud");
    mocks.close.mockClear();
    mocks.onUpdate.mockReset().mockReturnValue(mocks.unsubscribe);
    mocks.unsubscribe.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("closes and releases the subscription before the Vercel function deadline", async () => {
    const response = await GET(new Request("https://zap.wzrd.tech/api/studio/runs/stream"));
    const reader = response.body?.getReader();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(reader).toBeDefined();

    const connected = await reader!.read();
    expect(new TextDecoder().decode(connected.value)).toContain(": connected");

    await vi.advanceTimersByTimeAsync(STUDIO_RUN_STREAM_LIFETIME_MS - 1);
    expect(mocks.unsubscribe).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    let chunk = await reader!.read();
    while (!chunk.done) chunk = await reader!.read();
    expect(chunk.done).toBe(true);
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(STUDIO_RUN_STREAM_LIFETIME_MS).toBeLessThan(300_000);
  });
});
