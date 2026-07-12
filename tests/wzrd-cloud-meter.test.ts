import { beforeEach, describe, expect, it } from "vitest";
import {
  resetInMemoryWzrdCloudMeter,
  reserveWzrdCloudSpend,
  settleWzrdCloudSpend,
} from "../lib/wzrd-cloud-meter";

const principalId = "wallet:0x1111111111111111111111111111111111111111";
const now = new Date("2026-07-10T20:00:00.000Z");

describe("WZRD Cloud daily spend cap", () => {
  beforeEach(() => resetInMemoryWzrdCloudMeter());

  it("atomically rejects quotes over the per-wallet daily cap", async () => {
    await reserveWzrdCloudSpend({ capUsd: 10, now, principalId, quoteUsd: 6, runId: "run_1", useMemory: true });
    await expect(reserveWzrdCloudSpend({ capUsd: 10, now, principalId, quoteUsd: 5, runId: "run_2", useMemory: true }))
      .rejects.toThrow(/daily cap/i);
  });

  it("is idempotent for the same run and settles unused reservation", async () => {
    const first = await reserveWzrdCloudSpend({ capUsd: 10, now, principalId, quoteUsd: 6, runId: "run_1", useMemory: true });
    const replay = await reserveWzrdCloudSpend({ capUsd: 10, now, principalId, quoteUsd: 6, runId: "run_1", useMemory: true });
    expect(replay.totalReservedUsd).toBe(first.totalReservedUsd);
    await settleWzrdCloudSpend({ actualUsd: 2, now, principalId, runId: "run_1", useMemory: true });
    const next = await reserveWzrdCloudSpend({ capUsd: 10, now, principalId, quoteUsd: 8, runId: "run_2", useMemory: true });
    expect(next.totalReservedUsd).toBe(10);
  });
});
