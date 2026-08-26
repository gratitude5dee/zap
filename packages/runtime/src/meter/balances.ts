import { roundUsd } from "./units.ts";

/**
 * Per-principal balance in USD. Positive = credit (over-reserved), applied to
 * the next quote; negative = owed, added to the next quote.
 */
export interface BalanceStore {
  get(principalId: string): Promise<number>;
  adjust(principalId: string, deltaUsd: number): Promise<number>;
}

export interface MemoryBalances extends BalanceStore {
  reset(): void;
}

export function memoryBalances(): MemoryBalances {
  const balances = new Map<string, number>();
  return {
    reset(): void {
      balances.clear();
    },
    async get(principalId: string): Promise<number> {
      return balances.get(principalId) ?? 0;
    },
    async adjust(principalId: string, deltaUsd: number): Promise<number> {
      const next = roundUsd((balances.get(principalId) ?? 0) + deltaUsd);
      balances.set(principalId, next);
      return next;
    },
  };
}

/** Minimal Redis surface the balance and gate stores need. */
export interface RedisEval {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export function redisBalances(redis: RedisEval, prefix = "zap:balance"): BalanceStore {
  return {
    async get(principalId: string): Promise<number> {
      const value = await redis.eval(
        "return redis.call('GET', KEYS[1]) or '0'",
        [`${prefix}:${principalId}`],
        [],
      );
      return Number(value) || 0;
    },
    async adjust(principalId: string, deltaUsd: number): Promise<number> {
      const value = await redis.eval(
        "return redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])",
        [`${prefix}:${principalId}`],
        [String(deltaUsd)],
      );
      return Number(value) || 0;
    },
  };
}
