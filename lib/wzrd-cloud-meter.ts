import { getRedis } from "./redis";

type SpendIdentity = {
  now?: Date;
  principalId: string;
  runId: string;
  useMemory?: boolean;
};

type ReserveArgs = SpendIdentity & {
  capUsd?: number;
  quoteUsd: number;
};

type SettleArgs = SpendIdentity & {
  actualUsd: number;
};

const memoryTotals = new Map<string, number>();
const memoryRuns = new Map<string, number>();

export async function reserveWzrdCloudSpend(args: ReserveArgs) {
  const capUsd = args.capUsd ?? configuredDailyCap();
  assertAmount(args.quoteUsd, "quote");
  assertAmount(capUsd, "daily cap");
  const keys = meterKeys(args);
  const ttl = ttlSeconds(args.now);
  const redis = args.useMemory ? null : getRedis();

  if (!redis) {
    if (!args.useMemory && process.env.NODE_ENV === "production") {
      throw new Error("Upstash Redis is required for atomic WZRD Cloud spend caps.");
    }
    const totalReservedUsd = reserveMemory(keys.total, keys.run, args.quoteUsd, capUsd);
    return { capUsd, totalReservedUsd };
  }

  const result = Number(await redis.eval(
    [
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
    ].join("\n"),
    [keys.total, keys.run],
    [String(args.quoteUsd), String(capUsd), String(ttl)],
  ));
  if (result < 0) throw dailyCapError(capUsd);
  return { capUsd, totalReservedUsd: result };
}

export async function settleWzrdCloudSpend(args: SettleArgs) {
  assertAmount(args.actualUsd, "actual spend");
  const keys = meterKeys(args);
  const ttl = ttlSeconds(args.now);
  const redis = args.useMemory ? null : getRedis();
  if (!redis) {
    if (!args.useMemory && process.env.NODE_ENV === "production") return;
    settleMemory(keys.total, keys.run, args.actualUsd);
    return;
  }
  await redis.eval(
    [
      "local prior = tonumber(redis.call('GET', KEYS[2]) or '0')",
      "local actual = tonumber(ARGV[1])",
      "local delta = actual - prior",
      "if delta ~= 0 then redis.call('INCRBYFLOAT', KEYS[1], tostring(delta)) end",
      "redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])",
      "redis.call('EXPIRE', KEYS[1], ARGV[2])",
      "return 1",
    ].join("\n"),
    [keys.total, keys.run],
    [String(args.actualUsd), String(ttl)],
  );
}

export function resetInMemoryWzrdCloudMeter() {
  memoryRuns.clear();
  memoryTotals.clear();
}

function reserveMemory(totalKey: string, runKey: string, quoteUsd: number, capUsd: number) {
  if (memoryRuns.has(runKey)) return memoryTotals.get(totalKey) ?? 0;
  const current = memoryTotals.get(totalKey) ?? 0;
  const next = roundUsd(current + quoteUsd);
  if (next > capUsd) throw dailyCapError(capUsd);
  memoryRuns.set(runKey, quoteUsd);
  memoryTotals.set(totalKey, next);
  return next;
}

function settleMemory(totalKey: string, runKey: string, actualUsd: number) {
  const prior = memoryRuns.get(runKey) ?? 0;
  memoryTotals.set(totalKey, roundUsd(Math.max(0, (memoryTotals.get(totalKey) ?? 0) + actualUsd - prior)));
  memoryRuns.set(runKey, actualUsd);
}

function meterKeys({ now = new Date(), principalId, runId }: SpendIdentity) {
  if (!/^wallet:0x[a-f0-9]{40}$/.test(principalId)) throw new Error("A verified wallet principal is required for WZRD Cloud metering.");
  if (!/^run_[a-zA-Z0-9_-]+$/.test(runId)) throw new Error("A valid run id is required for WZRD Cloud metering.");
  const day = now.toISOString().slice(0, 10);
  const principal = principalId.slice("wallet:".length);
  return {
    run: `zap:wzrd-cloud:${day}:${principal}:run:${runId}`,
    total: `zap:wzrd-cloud:${day}:${principal}:total`,
  };
}

function configuredDailyCap() {
  const value = Number(process.env.WZRD_CLOUD_DAILY_CAP_USD);
  if (!Number.isFinite(value) || value <= 0) throw new Error("WZRD_CLOUD_DAILY_CAP_USD must be a positive number.");
  return value;
}

function ttlSeconds(now = new Date()) {
  const tomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2);
  return Math.max(60, Math.ceil((tomorrow - now.getTime()) / 1000));
}

function assertAmount(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`WZRD Cloud ${label} must be a non-negative finite number.`);
}

function dailyCapError(capUsd: number) {
  return new Error(`WZRD Cloud daily cap of $${capUsd.toFixed(2)} would be exceeded.`);
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
