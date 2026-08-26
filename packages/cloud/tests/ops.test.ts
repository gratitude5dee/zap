import { describe, expect, it } from "vitest";
import { createTestCloud, x402Credential } from "../src/testing.ts";
import { sweepRuntimes } from "../src/sweep.ts";

const ADAPTERS = ["vercel", "cloudflare"] as const;

describe.each(ADAPTERS)("admin ops counters (%s adapter)", (adapter) => {
  it("requires the admin token", async () => {
    const cloud = createTestCloud({ adapter });
    expect((await cloud.app.request("/v1/admin/ops")).status).toBe(401);
    const forbidden = await cloud.app.request("/v1/admin/ops", {
      headers: { authorization: "Bearer token-alice" },
    });
    expect(forbidden.status).toBe(401);
  });

  it("counters reconcile with the ledger and runtime state", async () => {
    const cloud = createTestCloud({ adapter });
    const created = await cloud.app.request("/v1/runtimes", {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ weight: "light", provider: "box" }),
    });
    const { id } = (await created.json()) as { id: string };

    const paid = await cloud.app.request(`/v1/runtimes/${id}/exec`, {
      method: "POST",
      headers: {
        authorization: "Bearer token-alice",
        "content-type": "application/json",
        "PAYMENT-SIGNATURE": x402Credential({ nonce: "n-ops", amountUsd: 1 }),
      },
      body: JSON.stringify({ prompt: "hi" }),
    });
    expect(paid.status).toBe(200);

    const rejected = await cloud.app.request(`/v1/runtimes/${id}/exec`, {
      method: "POST",
      headers: { authorization: "Bearer token-alice", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "hi again" }),
    });
    expect(rejected.status).toBe(402);

    await cloud.seedRuntime({ id: "rt_expired", state: "idle", stopAfter: "2020-01-01T00:00:00Z" });
    await sweepRuntimes(cloud.deps, new Date());

    const res = await cloud.app.request("/v1/admin/ops", {
      headers: { authorization: "Bearer test-admin-token" },
    });
    expect(res.status).toBe(200);
    const ops = (await res.json()) as {
      startsLastHour: number;
      runtimesByState: Record<string, number>;
      settlesToday: { count: number; usd: number };
      startLimitReached: number;
      sweeperStops: number;
      gateRejections: number;
    };
    expect(ops.startsLastHour).toBeGreaterThanOrEqual(1);
    expect(ops.runtimesByState.stopped ?? 0).toBeGreaterThanOrEqual(1);
    expect(ops.settlesToday.count).toBe((await cloud.deps.receipts.list()).length);
    expect(ops.settlesToday.usd).toBeCloseTo(
      (await cloud.deps.receipts.list()).reduce((sum, r) => sum + r.amountUsd, 0),
      6,
    );
    expect(ops.sweeperStops).toBe(1);
    expect(ops.gateRejections).toBeGreaterThanOrEqual(1);
    expect(ops.startLimitReached).toBe(0);
  });
});
