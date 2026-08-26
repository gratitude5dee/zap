import { BOX_SKUS, DEFAULT_PRICING, type BoxSize, type ModelRate, type SkuPrice } from "./pricing.ts";
import type { BalanceStore } from "./balances.ts";
import type { LedgerStore } from "./ledger.ts";
import {
  MeterError,
  assertAmount,
  roundUsd,
  type IdleScope,
  type LedgerEntry,
  type LedgerScope,
  type MeterLine,
  type MeterQuote,
  type MeterScope,
  type MeterService,
  type MeterStore,
  type PayerMode,
  type QuoteLine,
} from "./units.ts";
import type { RedisEval } from "./balances.ts";

export { MeterError } from "./units.ts";
export type {
  IdleScope,
  LedgerEntry,
  LedgerScope,
  MeterLine,
  MeterQuote,
  MeterScope,
  MeterService,
  MeterStore,
  PayerMode,
  QuoteLine,
} from "./units.ts";
export { BOX_SKUS, DEFAULT_PRICING } from "./pricing.ts";
export type { BoxSize, ModelRate, SkuPrice } from "./pricing.ts";
export { memoryLedger, jsonlLedger } from "./ledger.ts";
export type { LedgerStore, MemoryLedger } from "./ledger.ts";
export { memoryBalances, redisBalances } from "./balances.ts";
export type { BalanceStore, MemoryBalances, RedisEval } from "./balances.ts";

const DEFAULT_DAILY_CAP_USD = 20;

function dayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** In-memory reserve/settle store: same semantics as the Upstash Lua scripts. */
export function memoryMeterStore(): MeterStore {
  const totals = new Map<string, number>();
  const runs = new Map<string, number>();
  const keysOf = (day: string, principalId: string, runId: string) => ({
    total: `zap:meter:${day}:${principalId}:total`,
    run: `zap:meter:${day}:${principalId}:run:${runId}`,
  });
  return {
    async reserve(day, principalId, runId, quoteUsd, capUsd): Promise<number> {
      const keys = keysOf(day, principalId, runId);
      if (runs.has(keys.run)) return totals.get(keys.total) ?? 0;
      const next = roundUsd((totals.get(keys.total) ?? 0) + quoteUsd);
      if (next > capUsd) {
        throw new MeterError(
          "DAILY_CAP_EXCEEDED",
          `Daily spend cap of $${capUsd} reached.`,
          "Raise ZAP_DAILY_CAP_USD or wait for the next UTC day.",
        );
      }
      runs.set(keys.run, quoteUsd);
      totals.set(keys.total, next);
      return next;
    },
    async settle(day, principalId, runId, actualUsd): Promise<{ priorReservedUsd: number }> {
      const keys = keysOf(day, principalId, runId);
      const prior = runs.get(keys.run) ?? 0;
      totals.set(keys.total, roundUsd(Math.max(0, (totals.get(keys.total) ?? 0) + actualUsd - prior)));
      runs.set(keys.run, actualUsd);
      return { priorReservedUsd: prior };
    },
  };
}

const RESERVE_LUA = [
  "local prior = redis.call('GET', KEYS[2])",
  "if prior then return tonumber(redis.call('GET', KEYS[1]) or '0') end",
  "local current = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "local amount = tonumber(ARGV[1])",
  "local cap = tonumber(ARGV[2])",
  "if current + amount > cap then return -1 end",
  "redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[3])",
  "local total = redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])",
  "redis.call('EXPIRE', KEYS[1], ARGV[3])",
  "return tonumber(total)",
].join("\n");

const SETTLE_LUA = [
  "local prior = tonumber(redis.call('GET', KEYS[2]) or '0')",
  "local actual = tonumber(ARGV[1])",
  "local delta = actual - prior",
  "if delta ~= 0 then redis.call('INCRBYFLOAT', KEYS[1], tostring(delta)) end",
  "redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])",
  "redis.call('EXPIRE', KEYS[1], ARGV[2])",
  "return prior",
].join("\n");

const DAY_TTL_SECONDS = 2 * 24 * 60 * 60;

/** Upstash-backed atomic reserve/settle keyed `zap:meter:<day>:<principal>`. */
export function redisMeterStore(redis: RedisEval): MeterStore {
  const keysOf = (day: string, principalId: string, runId: string) => [
    `zap:meter:${day}:${principalId}:total`,
    `zap:meter:${day}:${principalId}:run:${runId}`,
  ];
  return {
    async reserve(day, principalId, runId, quoteUsd, capUsd): Promise<number> {
      const total = Number(
        await redis.eval(RESERVE_LUA, keysOf(day, principalId, runId), [
          String(quoteUsd),
          String(capUsd),
          String(DAY_TTL_SECONDS),
        ]),
      );
      if (total < 0) {
        throw new MeterError(
          "DAILY_CAP_EXCEEDED",
          `Daily spend cap of $${capUsd} reached.`,
          "Raise ZAP_DAILY_CAP_USD or wait for the next UTC day.",
        );
      }
      return total;
    },
    async settle(day, principalId, runId, actualUsd): Promise<{ priorReservedUsd: number }> {
      const prior = Number(
        await redis.eval(SETTLE_LUA, keysOf(day, principalId, runId), [
          String(actualUsd),
          String(DAY_TTL_SECONDS),
        ]),
      );
      return { priorReservedUsd: Number.isFinite(prior) ? prior : 0 };
    },
  };
}

export interface CreateMeterOptions {
  store: MeterStore;
  ledger: LedgerStore;
  balances: BalanceStore;
  payer: PayerMode;
  env?: Record<string, string | undefined>;
  pricing?: Record<string, SkuPrice>;
  modelRates?: Record<string, ModelRate>;
  now?: () => Date;
}

function dailyCapUsd(env: Record<string, string | undefined>): number {
  const primary = Number(env.ZAP_DAILY_CAP_USD);
  if (Number.isFinite(primary) && primary > 0) return primary;
  const alias = Number(env.WZRD_CLOUD_DAILY_CAP_USD);
  if (Number.isFinite(alias) && alias > 0) return alias;
  return DEFAULT_DAILY_CAP_USD;
}

function marginMultiplier(env: Record<string, string | undefined>): number {
  const bps = Number(env.ZAP_MARGIN_BPS);
  if (Number.isFinite(bps) && bps > 0) return 1 + bps / 10_000;
  return 1;
}

export function sandboxSecondsLine(input: { size: BoxSize; seconds: number }): MeterLine {
  const sku = BOX_SKUS[input.size];
  const price = DEFAULT_PRICING[sku];
  if (!price) throw new MeterError("PRICE_UNKNOWN", `No price for sku "${sku}".`);
  return {
    unit: "sandbox_second",
    qty: input.seconds,
    usd: roundUsd(input.seconds * price.usdPerUnit),
    sku,
  };
}

export function createMeter(options: CreateMeterOptions): MeterService {
  const env = options.env ?? {};
  const pricing = options.pricing ?? DEFAULT_PRICING;
  const modelRates = options.modelRates ?? {};
  const now = options.now ?? (() => new Date());
  const margin = marginMultiplier(env);

  function priceLine(line: QuoteLine, live: boolean): MeterLine {
    const sku = pricing[line.sku];
    if (sku && sku.unit === line.unit) {
      return { ...line, usd: roundUsd(line.qty * sku.usdPerUnit * margin) };
    }
    const rate = modelRates[line.sku];
    if (rate && line.unit === "gateway_input_token") {
      return { ...line, usd: roundUsd((line.qty / 1_000_000) * rate.inputUsdPerMTok * margin) };
    }
    if (rate && line.unit === "gateway_output_token") {
      return { ...line, usd: roundUsd((line.qty / 1_000_000) * rate.outputUsdPerMTok * margin) };
    }
    if (live) {
      throw new MeterError(
        "PRICE_UNKNOWN",
        `No live price for sku "${line.sku}" (${line.unit}).`,
        "Add the sku to pricing or modelRates before running live.",
      );
    }
    return { ...line, usd: 0 };
  }

  return {
    async quote(plan): Promise<MeterQuote> {
      const lines = plan.lines.map((line) => priceLine(line, plan.live ?? false));
      let usd = roundUsd(lines.reduce((sum, line) => sum + line.usd, 0));
      let creditApplied = 0;
      if (plan.principalId) {
        const balance = await options.balances.get(plan.principalId);
        if (balance > 0) {
          creditApplied = roundUsd(Math.min(balance, usd));
          usd = roundUsd(usd - creditApplied);
        } else if (balance < 0) {
          usd = roundUsd(usd - balance);
        }
      }
      return { usd, lines, creditApplied };
    },

    async reserve(scope, quoteUsd) {
      assertAmount(quoteUsd, "quote");
      const capUsd = dailyCapUsd(env);
      const totalReservedUsd = await options.store.reserve(
        dayOf(now()),
        scope.principalId,
        scope.runId,
        quoteUsd,
        capUsd,
      );
      return { capUsd, totalReservedUsd };
    },

    async settle(scope, actual) {
      const actualUsd = roundUsd(actual.reduce((sum, line) => sum + line.usd, 0));
      assertAmount(actualUsd, "actual spend");
      const { priorReservedUsd } = await options.store.settle(
        dayOf(now()),
        scope.principalId,
        scope.runId,
        actualUsd,
      );
      const diff = roundUsd(priorReservedUsd - actualUsd);
      if (diff !== 0) await options.balances.adjust(scope.principalId, diff);
      const at = now().toISOString();
      for (const line of actual) {
        const entry: LedgerEntry = {
          ...line,
          principalId: scope.principalId,
          runId: scope.runId,
          runtimeId: scope.runtimeId,
          at,
          payer: options.payer,
          receiptId: scope.receiptId,
        };
        await options.ledger.append(entry);
      }
    },

    async settleIdle(scope: IdleScope, lines) {
      const at = now().toISOString();
      for (const line of lines) {
        const entry: LedgerEntry = {
          ...line,
          principalId: scope.principalId,
          runId: null,
          runtimeId: scope.runtimeId,
          at,
          payer: options.payer,
        };
        await options.ledger.append(entry);
      }
    },

    ledger(scope: LedgerScope): AsyncIterable<LedgerEntry> {
      return options.ledger.read(scope);
    },
  };
}

/**
 * In-VM meter: quotes are pure over the shipped pricing table; everything
 * that would reach Upstash or Convex fails with METER_OFF_VM.
 */
export function meterReporter(options?: {
  pricing?: Record<string, SkuPrice>;
  modelRates?: Record<string, ModelRate>;
  emit?: (lines: MeterLine[]) => void;
}): MeterService & { emit(lines: MeterLine[]): void } {
  const pricing = options?.pricing ?? DEFAULT_PRICING;
  const modelRates = options?.modelRates ?? {};
  const offVm = () =>
    new MeterError("METER_OFF_VM", "A VM never reserves or settles; the caller kernel does.");
  return {
    async quote(plan): Promise<MeterQuote> {
      const lines = plan.lines.map((line): MeterLine => {
        const sku = pricing[line.sku];
        if (sku && sku.unit === line.unit) {
          return { ...line, usd: roundUsd(line.qty * sku.usdPerUnit) };
        }
        const rate = modelRates[line.sku];
        if (rate && line.unit === "gateway_input_token") {
          return { ...line, usd: roundUsd((line.qty / 1_000_000) * rate.inputUsdPerMTok) };
        }
        if (rate && line.unit === "gateway_output_token") {
          return { ...line, usd: roundUsd((line.qty / 1_000_000) * rate.outputUsdPerMTok) };
        }
        return { ...line, usd: 0 };
      });
      return { usd: roundUsd(lines.reduce((sum, line) => sum + line.usd, 0)), lines, creditApplied: 0 };
    },
    emit(lines: MeterLine[]): void {
      options?.emit?.(lines);
    },
    async reserve(): Promise<never> {
      throw offVm();
    },
    async settle(): Promise<never> {
      throw offVm();
    },
    async settleIdle(): Promise<never> {
      throw offVm();
    },
    // eslint-disable-next-line require-yield
    async *ledger(): AsyncIterable<LedgerEntry> {
      throw offVm();
    },
  };
}
