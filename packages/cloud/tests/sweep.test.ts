import { describe, expect, it } from "vitest";
import { createTestCloud } from "../src/testing.ts";
import { sweepRuntimes } from "../src/sweep.ts";

const ADAPTERS = ["vercel", "cloudflare"] as const;

const NOW = new Date("2026-01-01T12:00:00Z");
const PAST = new Date(NOW.getTime() - 60_000).toISOString();
const FUTURE = new Date(NOW.getTime() + 60_000).toISOString();

describe.each(ADAPTERS)("stop_after sweeper (%s adapter)", (adapter) => {
  it("stops only ready|idle runtimes past their deadline, never running, never with force", async () => {
    const cloud = createTestCloud({ adapter });
    await cloud.seedRuntime({ id: "rt_ready", state: "ready", stopAfter: PAST });
    await cloud.seedRuntime({ id: "rt_idle", state: "idle", stopAfter: PAST });
    await cloud.seedRuntime({ id: "rt_running", state: "running", stopAfter: PAST });
    await cloud.seedRuntime({ id: "rt_fresh", state: "ready", stopAfter: FUTURE });
    await cloud.seedRuntime({ id: "rt_stopped", state: "stopped", stopAfter: PAST });

    const result = await sweepRuntimes(cloud.deps, NOW);
    expect(result.stopped.sort()).toEqual(["rt_idle", "rt_ready"]);
    expect(cloud.sandbox.stops.map((s) => s.id).sort()).toEqual(["rt_idle", "rt_ready"]);
    for (const stop of cloud.sandbox.stops) {
      expect(stop.force).not.toBe(true);
    }
    expect(cloud.sandbox.stops.some((s) => s.id === "rt_running")).toBe(false);
  });

  it("backs off when the provider reports SandboxStartLimit", async () => {
    const cloud = createTestCloud({ adapter });
    await cloud.seedRuntime({ id: "rt_limit", state: "ready", stopAfter: PAST });
    cloud.sandbox.failWith("rt_limit", "SandboxStartLimit");

    const result = await sweepRuntimes(cloud.deps, NOW);
    expect(result.stopped).toEqual([]);
    expect(result.backedOff).toEqual(["rt_limit"]);
    const row = await cloud.deps.runtimes.get("rt_limit");
    expect(row?.stopAfter).toBeTruthy();
    expect(new Date(row?.stopAfter ?? 0).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("GET /v1/sweep requires the cron secret", async () => {
    const cloud = createTestCloud({ adapter });
    const unauthorized = await cloud.app.request("/v1/sweep");
    expect(unauthorized.status).toBe(401);
    const ok = await cloud.app.request("/v1/sweep", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    expect(ok.status).toBe(200);
  });
});
