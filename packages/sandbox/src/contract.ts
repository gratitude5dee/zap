// Sandbox contract — owned by session B from Z2; adapters implement it; nobody else edits it.
import type { Disposer } from "@wzrdtech/zap-kernel";

/**
 * "local" = this machine, mounted only under zap-agentd serve.
 * "fake" mounts only with ZAP_ALLOW_FAKE_SANDBOX=1.
 */
export type SandboxProviderId =
  | "box"
  | "namespace"
  | "selfhost"
  | "microsandbox"
  | "e2b"
  | "daytona"
  | "cloudflare"
  | "docker"
  | "local"
  | "fake"
  | "modal"
  | `catalog:${string}`;

export interface SandboxCapabilities {
  exec: true;
  files: true;
  readdir: boolean;
  detached: boolean;
  snapshot: boolean;
  fork: boolean;
  stop: boolean;
  resume: boolean;
  ports: boolean;
  privatePorts: boolean;
  desktop: boolean;
  ssh: boolean;
  networkPolicy: "none" | "allow-deny" | "domains";
  gpu: boolean;
  kvm: boolean;
  docker: boolean;
  isolation: "vm" | "microvm" | "container" | "process" | "hyperlight-wasm" | "none";
  sizes: readonly string[];
  maxCommandSeconds: number;
}

export interface SandboxSpec {
  provider: SandboxProviderId;
  template?: string;
  size?: string;
  region?: string;
  /** per-sandbox only; validated against the template allowlist */
  env?: Record<string, string>;
  ttlSeconds?: number | null;
  tags?: Record<string, string>;
  /** reconnect */
  existing?: { id: string; metadata?: Record<string, unknown> };
  idempotencyKey: string;
  purpose: "template-build" | "runtime" | "run" | "lane" | "test";
}

export type LaneId = "codegen" | "ffmpeg" | "media-workflows" | "browser" | "wasm" | `gpu:${string}`;

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  detached?: boolean;
  signal?: AbortSignal;
  stdin?: Uint8Array;
  lane?: LaneId;
}

export interface LaneRun {
  /** default: ulid; names /zap/runs/<id>.log and done/<id>.json */
  id?: string;
  lane: LaneId;
  argv: readonly string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  truncated: boolean;
  startedAt: string;
  finishedAt: string;
  usage: { cpuSeconds?: number; bytesIn: number; bytesOut: number };
}

/**
 * The `lanes` service; provided by packages/runtime lanes.core, typed here so
 * sandbox.local can inject it without a runtime import.
 */
export interface LaneExecutor {
  run(
    r: LaneRun,
  ): Promise<ExecResult & { id: string; isolation: SandboxCapabilities["isolation"] | "gpu"; lane: LaneId }>;
  allowed(lane: LaneId, argv0: string): boolean;
}

export interface SandboxFs {
  read(path: string, opts?: { signal?: AbortSignal }): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
  readdir?(path: string): Promise<Array<{ name: string; type: "file" | "dir" | "symlink"; size?: number }>>;
  remove(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  resolve(path: string): string;
}

export interface SnapshotRef {
  provider: SandboxProviderId;
  id: string;
  name?: string;
  createdAt: string;
}

export interface HostedPort {
  port: number;
  url: string;
  /** server-side only, redacted in logs */
  token?: string;
  isPrivate: boolean;
}

export interface SandboxHandle {
  readonly id: string;
  readonly provider: SandboxProviderId;
  readonly capabilities: SandboxCapabilities;
  state(): Promise<"provisioning" | "ready" | "running" | "idle" | "stopped" | "error" | "queued">;
  /** string = `bash -lc`; argv = no shell (required when opts.lane is set) */
  exec(command: string | readonly string[], opts?: ExecOptions): Promise<ExecResult>;
  readonly fs: SandboxFs;
  snapshot?(name?: string): Promise<SnapshotRef>;
  /** idempotencyKey required */
  fork?(spec: Pick<SandboxSpec, "idempotencyKey" | "purpose"> & Partial<SandboxSpec>): Promise<SandboxHandle>;
  /** never force */
  stop?(): Promise<void>;
  /** Box: re-reads hosted URLs/tokens afterwards */
  resume?(): Promise<void>;
  host?(port: number, opts?: { private?: boolean; title?: string }): Promise<HostedPort>;
  desktop?(opts?: { vnc?: boolean }): Promise<{ url: string }>;
  setNetworkPolicy?(policy: "allow-all" | "deny-all" | { allow: string[] }): Promise<void>;
  /** optional; never implied by release() */
  remove?(): Promise<void>;
  /**
   * the ctx.effect inverse — release matrix: purpose runtime|template-build → stop (keep disk);
   * run|lane → keep running (parent runtime owns it); test → stop then remove if supported
   */
  release(): Promise<void>;
  captureState(): Promise<{ provider: SandboxProviderId; metadata: Record<string, unknown> }>;
}

export interface DoctorCheck {
  id: string;
  ok: boolean;
  required: boolean;
  detail?: string;
  remediation?: string;
}

export interface DoctorReport {
  provider: SandboxProviderId;
  ok: boolean;
  checks: DoctorCheck[];
}

export interface SandboxProvider {
  readonly id: SandboxProviderId;
  capabilities(): Promise<SandboxCapabilities>;
  acquire(spec: SandboxSpec): Promise<SandboxHandle>;
  templates?(): Promise<Array<{ name: string; ref: SnapshotRef }>>;
  doctor(): Promise<DoctorReport>;
}

export interface SandboxService {
  register(provider: SandboxProvider): Disposer;
  acquire(spec: SandboxSpec): Promise<SandboxHandle>;
  providers(): SandboxProviderId[];
  default: SandboxProviderId;
}

export class SandboxStartLimit extends Error {
  readonly code = "START_LIMIT_REACHED";
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number, message = "sandbox start limit reached") {
    super(message);
    this.name = "SandboxStartLimit";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
