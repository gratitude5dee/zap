import type {
  CloudMeter,
  LedgerRow,
  NonceStore,
  OpsCounters,
  RateLimiter,
  ReceiptRow,
  ReceiptStore,
  RuntimeRow,
  RuntimeStore,
} from "./types.ts";

export function memoryRuntimeStore(): RuntimeStore {
  const rows = new Map<string, RuntimeRow>();
  return {
    async insert(row) {
      rows.set(row.id, { ...row });
    },
    async get(id) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
    async byToken(token) {
      for (const row of rows.values()) {
        if (row.runtimeToken === token) return { ...row };
      }
      return null;
    },
    async list(tenantId) {
      return [...rows.values()].filter((row) => row.tenantId === tenantId).map((row) => ({ ...row }));
    },
    async all() {
      return [...rows.values()].map((row) => ({ ...row }));
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, ...patch });
    },
  };
}

export function memoryReceiptStore(trace?: (event: string) => void): ReceiptStore {
  const rows: ReceiptRow[] = [];
  return {
    async insert(row) {
      rows.push({ ...row });
      trace?.("receipt.insert");
    },
    async list() {
      return rows.map((row) => ({ ...row }));
    },
  };
}

export function memoryNonceStore(): NonceStore {
  const seen = new Set<string>();
  return {
    async setNX(id) {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    },
  };
}

export function memoryCloudMeter(
  trace?: (event: string) => void,
  onLine?: (line: LedgerRow) => void,
): CloudMeter {
  const ledger: LedgerRow[] = [];
  const balances = new Map<string, number>();
  return {
    async reserve(principalId, _runId, usd) {
      balances.set(principalId, (balances.get(principalId) ?? 0) - usd);
      trace?.("meter.reserve");
    },
    async settle(entry) {
      ledger.push({ ...entry });
      onLine?.({ ...entry });
      trace?.("meter.settle");
    },
    async ledger(principalId) {
      return ledger.filter((row) => row.principalId === principalId).map((row) => ({ ...row }));
    },
    async balance(principalId) {
      return balances.get(principalId) ?? 0;
    },
  };
}

export function memoryRateLimiter(now: () => number = Date.now): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    async hit(bucket, limit, windowMs) {
      const cutoff = now() - windowMs;
      const list = (hits.get(bucket) ?? []).filter((at) => at > cutoff);
      if (list.length >= limit) {
        hits.set(bucket, list);
        return false;
      }
      list.push(now());
      hits.set(bucket, list);
      return true;
    },
  };
}

export function memoryOpsCounters(now: () => number = Date.now): OpsCounters {
  const counts: Record<string, number> = {};
  const startTimes: number[] = [];
  return {
    async bump(name) {
      counts[name] = (counts[name] ?? 0) + 1;
      if (name === "starts") startTimes.push(now());
    },
    async read() {
      return { ...counts };
    },
    async startsSince(sinceMs) {
      return startTimes.filter((at) => at >= sinceMs).length;
    },
  };
}
