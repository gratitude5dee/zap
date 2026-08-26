import { beforeEach, describe, expect, it } from "vitest";
import {
  createMeter,
  memoryMeterStore,
  sandboxSecondsLine,
  type MeterService,
} from "../src/meter/index.ts";
import { memoryLedger } from "../src/meter/ledger.ts";
import { memoryBalances } from "../src/meter/balances.ts";
import { MeterError } from "../src/meter/units.ts";

const PRINCIPAL = "wallet:0x1111111111111111111111111111111111111111";

function makeMeter(overrides?: {
  env?: Record<string, string | undefined>;
  ledger?: ReturnType<typeof memoryLedger>;
  balances?: ReturnType<typeof memoryBalances>;
  store?: ReturnType<typeof memoryMeterStore>;
}): {
  meter: MeterService;
  ledger: ReturnType<typeof memoryLedger>;
  balances: ReturnType<typeof memoryBalances>;
  store: ReturnType<typeof memoryMeterStore>;
} {
  const ledger = overrides?.ledger ?? memoryLedger();
  const balances = overrides?.balances ?? memoryBalances();
  const store = overrides?.store ?? memoryMeterStore();
  const meter = createMeter({
    store,
    ledger,
    balances,
    payer: "managed",
    env: overrides?.env ?? { ZAP_DAILY_CAP_USD: "10" },
    modelRates: {
      "openrouter/test/model": { inputUsdPerMTok: 3, outputUsdPerMTok: 15 },
    },
  });
  return { meter, ledger, balances, store };
}

describe("meter", () => {
  let ctx: ReturnType<typeof makeMeter>;

  beforeEach(() => {
    ctx = makeMeter();
  });

  it("reserve is idempotent per run and settle adjusts the total atomically (memory mode)", async () => {
    const scope = { principalId: PRINCIPAL, runId: "run_a" };
    const first = await ctx.meter.reserve(scope, 2);
    const again = await ctx.meter.reserve(scope, 2);
    expect(first.totalReservedUsd).toBe(2);
    expect(again.totalReservedUsd).toBe(2);
    await ctx.meter.settle(scope, [
      { unit: "api_call", qty: 1, usd: 0.5, sku: "api.generic" },
    ]);
    const next = await ctx.meter.reserve({ principalId: PRINCIPAL, runId: "run_b" }, 1);
    expect(next.totalReservedUsd).toBeCloseTo(1.5, 6);
  });

  it("enforces the daily cap with ZAP_DAILY_CAP_USD taking precedence", async () => {
    const capped = makeMeter({
      env: { ZAP_DAILY_CAP_USD: "1", WZRD_CLOUD_DAILY_CAP_USD: "100" },
    });
    await expect(
      capped.meter.reserve({ principalId: PRINCIPAL, runId: "run_cap" }, 2),
    ).rejects.toMatchObject({ code: "DAILY_CAP_EXCEEDED" });
  });

  it("falls back to WZRD_CLOUD_DAILY_CAP_USD as a read-only alias", async () => {
    const aliased = makeMeter({ env: { WZRD_CLOUD_DAILY_CAP_USD: "1" } });
    await expect(
      aliased.meter.reserve({ principalId: PRINCIPAL, runId: "run_alias" }, 2),
    ).rejects.toMatchObject({ code: "DAILY_CAP_EXCEEDED" });
  });

  it("quote fails with PRICE_UNKNOWN for an unknown sku in live mode", async () => {
    await expect(
      ctx.meter.quote({
        lines: [{ unit: "media_request", qty: 1, sku: "unknown/sku" }],
        live: true,
      }),
    ).rejects.toMatchObject({ code: "PRICE_UNKNOWN" });
    expect(MeterError).toBeDefined();
  });

  it("prices gateway tokens from modelRates", async () => {
    const quote = await ctx.meter.quote({
      lines: [
        { unit: "gateway_input_token", qty: 1_000_000, sku: "openrouter/test/model" },
        { unit: "gateway_output_token", qty: 1_000_000, sku: "openrouter/test/model" },
      ],
      live: true,
    });
    expect(quote.usd).toBeCloseTo(18, 6);
  });

  it("computes sandbox seconds from usage and the box size sku", () => {
    const line = sandboxSecondsLine({ size: "large", seconds: 3600 });
    expect(line.unit).toBe("sandbox_second");
    expect(line.sku).toBe("box.large");
    expect(line.qty).toBe(3600);
    expect(line.usd).toBeCloseTo(0.072, 6);
    const small = sandboxSecondsLine({ size: "small", seconds: 1800 });
    expect(small.usd).toBeCloseTo(0.009, 6);
  });

  it("bills idle seconds with runId null", async () => {
    await ctx.meter.settleIdle(
      { principalId: PRINCIPAL, runtimeId: "rt_1" },
      [sandboxSecondsLine({ size: "default", seconds: 60 })],
    );
    const entries = ctx.ledger.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.runId).toBeNull();
    expect(entries[0]?.runtimeId).toBe("rt_1");
  });

  it("ledger lines carry payer and receiptId", async () => {
    const scope = { principalId: PRINCIPAL, runId: "run_led", receiptId: "rcpt_1" };
    await ctx.meter.reserve(scope, 1);
    await ctx.meter.settle(scope, [
      { unit: "api_call", qty: 1, usd: 0.25, sku: "api.generic" },
    ]);
    const rows: Array<{ payer: string; receiptId?: string; runId: string | null }> = [];
    for await (const row of ctx.meter.ledger({ principalId: PRINCIPAL })) {
      rows.push(row);
    }
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payer).toBe("managed");
    expect(rows[0]?.receiptId).toBe("rcpt_1");
    expect(rows[0]?.runId).toBe("run_led");
  });

  it("balances record the settle-vs-reserve difference and the next quote applies it", async () => {
    const scope = { principalId: PRINCIPAL, runId: "run_bal" };
    await ctx.meter.reserve(scope, 2);
    await ctx.meter.settle(scope, [
      { unit: "api_call", qty: 1, usd: 0.5, sku: "api.generic" },
    ]);
    expect(await ctx.balances.get(PRINCIPAL)).toBeCloseTo(1.5, 6);
    const quote = await ctx.meter.quote({
      lines: [{ unit: "gateway_input_token", qty: 1_000_000, sku: "openrouter/test/model" }],
      live: true,
      principalId: PRINCIPAL,
    });
    expect(quote.creditApplied).toBeCloseTo(1.5, 6);
    expect(quote.usd).toBeCloseTo(1.5, 6);
  });
});
