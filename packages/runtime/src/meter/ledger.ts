import { promises as fs } from "node:fs";
import path from "node:path";
import type { LedgerEntry, LedgerScope } from "./units.ts";

export interface LedgerStore {
  append(entry: LedgerEntry): Promise<void>;
  read(scope: LedgerScope): AsyncIterable<LedgerEntry>;
}

export interface MemoryLedger extends LedgerStore {
  entries(): readonly LedgerEntry[];
}

function inScope(entry: LedgerEntry, scope: LedgerScope): boolean {
  if (entry.principalId !== scope.principalId) return false;
  if (scope.from && entry.at < scope.from) return false;
  if (scope.to && entry.at > scope.to) return false;
  return true;
}

export function memoryLedger(): MemoryLedger {
  const rows: LedgerEntry[] = [];
  return {
    entries(): readonly LedgerEntry[] {
      return rows;
    },
    async append(entry: LedgerEntry): Promise<void> {
      rows.push(entry);
    },
    async *read(scope: LedgerScope): AsyncIterable<LedgerEntry> {
      for (const entry of rows) {
        if (inScope(entry, scope)) yield entry;
      }
    },
  };
}

/** Local BYOK ledger: append-only JSONL at `.zap/ledger.jsonl`. */
export function jsonlLedger(filePath: string): LedgerStore {
  return {
    async append(entry: LedgerEntry): Promise<void> {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    },
    async *read(scope: LedgerScope): AsyncIterable<LedgerEntry> {
      let raw: string;
      try {
        raw = await fs.readFile(filePath, "utf8");
      } catch {
        return;
      }
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line) as LedgerEntry;
        if (inScope(entry, scope)) yield entry;
      }
    },
  };
}
