import type { MeterLine } from "@wzrdtech/core";
import type { Context as HonoContext, Hono, MiddlewareHandler } from "hono";

export type RuntimeState = "provisioning" | "ready" | "running" | "idle" | "stopped" | "error";

export interface RuntimeRow {
  id: string;
  tenantId: string;
  weight: "light" | "med" | "heavy";
  provider: string;
  /** the sandbox provider's own id for this box; all provider calls use it. */
  providerId: string;
  state: RuntimeState;
  createdAt: string;
  stopAfter: string | null;
  runtimeToken: string;
}

export interface RuntimeStore {
  insert(row: RuntimeRow): Promise<void>;
  get(id: string): Promise<RuntimeRow | null>;
  byToken(token: string): Promise<RuntimeRow | null>;
  list(tenantId: string): Promise<RuntimeRow[]>;
  all(): Promise<RuntimeRow[]>;
  update(id: string, patch: Partial<RuntimeRow>): Promise<void>;
}

export type PayProtocol = "x402" | "x402-v1" | "mpp";

export interface ReceiptRow {
  id: string;
  protocol: PayProtocol;
  nonce: string;
  payer: string;
  payTo: string;
  amountUsd: number;
  txHash: string;
  at: string;
}

export interface ReceiptStore {
  insert(row: ReceiptRow): Promise<void>;
  list(): Promise<ReceiptRow[]>;
}

/** Replay authority: `SET NX zap:gate:nonce:<id>` semantics. */
export interface NonceStore {
  setNX(id: string): Promise<boolean>;
}

export interface LedgerRow extends MeterLine {
  principalId: string;
  runId: string | null;
  runtimeId?: string;
  at: string;
  receiptId?: string;
}

export interface CloudMeter {
  reserve(principalId: string, runId: string, usd: number): Promise<void>;
  settle(entry: LedgerRow): Promise<void>;
  ledger(principalId: string): Promise<LedgerRow[]>;
  balance(principalId: string): Promise<number>;
}

export interface SandboxStop {
  id: string;
  force?: boolean;
}

export interface SandboxProvider {
  create(options: { weight: RuntimeRow["weight"]; noEnv: true }): Promise<{ providerId: string }>;
  exec(id: string, command: string[]): Promise<{ stdout: string; exitCode: number }>;
  stop(options: SandboxStop): Promise<void>;
  snapshot(id: string): Promise<{ snapshotId: string }>;
  fork(id: string, body: Record<string, unknown>): Promise<{ providerId: string }>;
}

export interface VerifiedPayment {
  payer: string;
  amountUsd: number;
  nonce: string;
}

export interface Facilitator {
  verify(payload: string, expect: { payTo: string }): Promise<VerifiedPayment>;
  settle(payload: string): Promise<{ txHash: string }>;
}

export interface RateLimiter {
  /** returns true when the hit is allowed within `limit` per `windowMs`. */
  hit(bucket: string, limit: number, windowMs: number): Promise<boolean>;
}

export interface OpsCounters {
  bump(name: "sweeperStops" | "gateRejections" | "startLimitReached" | "starts"): Promise<void>;
  read(): Promise<Record<string, number>>;
  startsSince(sinceMs: number): Promise<number>;
}

export interface LlmUpstream {
  llm(path: string, body: Record<string, unknown>): Promise<Response>;
  media(provider: string, kind: "submit" | "poll", body: Record<string, unknown>): Promise<Response>;
}

export interface RateLimitConfig {
  runtimesPerHour?: number;
  execPerMinute?: number;
  gatePerMinute?: number;
}

export interface CloudDeps {
  env: Record<string, string | undefined>;
  runtimes: RuntimeStore;
  receipts: ReceiptStore;
  nonces: NonceStore;
  meter: CloudMeter;
  sandbox: SandboxProvider;
  facilitator: Facilitator;
  limiter: RateLimiter;
  counters: OpsCounters;
  upstream: LlmUpstream;
  limits?: RateLimitConfig;
  /** treasury (or verified tenant wallet); never taken from request data. */
  treasury: string;
  /** ordered trace of gate-relevant events, for tests and audits. */
  trace?: (event: string) => void;
  now?: () => Date;
}

export interface CloudVars {
  principal?: string;
  receipt?: ReceiptRow;
  runtime?: RuntimeRow;
}

export type CloudHono = Hono<{ Variables: CloudVars }>;
export type CloudContext = HonoContext<{ Variables: CloudVars }>;
export type CloudMiddleware = MiddlewareHandler<{ Variables: CloudVars }>;

/**
 * Route-mounting convention: sibling packages (e.g. sessions) mount their
 * routes onto the shared app without editing cloud route files.
 */
export interface CloudRouteModule {
  name: string;
  mount(app: CloudHono, helpers: { gate: CloudMiddleware; deps: CloudDeps }): void;
}
