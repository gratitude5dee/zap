import type { MeterLine, MeterUnit } from "@wzrdtech/core";

export type { MeterLine, MeterUnit };

export type PayerMode = "missing" | "byok" | "managed";

export type MeterErrorCode =
  | "PRICE_UNKNOWN"
  | "DAILY_CAP_EXCEEDED"
  | "METER_OFF_VM"
  | "INVALID_AMOUNT"
  | "INVALID_PRINCIPAL";

export class MeterError extends Error {
  readonly code: MeterErrorCode;
  readonly remediation?: string;

  constructor(code: MeterErrorCode, message: string, remediation?: string) {
    super(message);
    this.name = "MeterError";
    this.code = code;
    this.remediation = remediation;
  }
}

/** A meter line before pricing: the quote fills in `usd`. */
export type QuoteLine = Omit<MeterLine, "usd">;

export interface MeterScope {
  principalId: string;
  runId: string;
  receiptId?: string;
  runtimeId?: string;
}

export interface IdleScope {
  principalId: string;
  runtimeId: string;
}

export interface LedgerScope {
  principalId: string;
  from?: string;
  to?: string;
}

export interface LedgerEntry extends MeterLine {
  principalId: string;
  runId: string | null;
  runtimeId?: string;
  at: string;
  payer: PayerMode;
  receiptId?: string;
}

export interface MeterQuote {
  usd: number;
  lines: MeterLine[];
  creditApplied: number;
}

export interface MeterService {
  quote(plan: { lines: QuoteLine[]; live?: boolean; principalId?: string }): Promise<MeterQuote>;
  reserve(scope: MeterScope, quoteUsd: number): Promise<{ capUsd: number; totalReservedUsd: number }>;
  settle(scope: MeterScope, actual: MeterLine[]): Promise<void>;
  settleIdle(scope: IdleScope, lines: MeterLine[]): Promise<void>;
  ledger(scope: LedgerScope): AsyncIterable<LedgerEntry>;
}

/** Atomic per-day reserve/settle store keyed `zap:meter:<day>:<principal>`. */
export interface MeterStore {
  reserve(day: string, principalId: string, runId: string, quoteUsd: number, capUsd: number): Promise<number>;
  settle(day: string, principalId: string, runId: string, actualUsd: number): Promise<{ priorReservedUsd: number }>;
}

export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function assertAmount(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new MeterError("INVALID_AMOUNT", `A non-negative ${label} amount is required.`);
  }
}
