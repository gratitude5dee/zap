import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type {
  DoctorReport,
  SandboxCapabilities,
  SandboxFs,
  SandboxHandle,
  SandboxProvider,
  SandboxService,
  SandboxSpec,
} from "../../contract.ts";

export class DaytonaSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DaytonaSandboxError";
    this.code = code;
  }
}

/** Default sandbox user home on Daytona images. */
export const DAYTONA_WORKDIR = "/home/daytona";
/** Pinned SDK release the adapter is written against (npm @daytonaio/sdk). */
export const DAYTONA_SDK_VERSION = "0.27.0";

export const DAYTONA_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: false,
  detached: false,
  snapshot: true,
  fork: false,
  stop: true,
  resume: true,
  ports: true,
  privatePorts: true,
  desktop: false,
  ssh: false,
  networkPolicy: "none",
  gpu: false,
  kvm: false,
  docker: false,
  isolation: "container",
  sizes: ["small", "default", "large"],
  maxCommandSeconds: 600,
};

/** Structural slice of the @daytonaio/sdk surface this adapter uses. */
export interface DaytonaSandboxLike {
  id: string;
  runCommand(
    command: string,
    opts?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  removePath(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  snapshot(name: string): Promise<{ id: string }>;
  stop(): Promise<void>;
  start(): Promise<void>;
  isStopped(): boolean;
  /** getPreviewLink — the token is server-side only and must never be logged (C24). */
  getPreviewLink(port: number): Promise<{ url: string; token?: string }>;
  delete(): Promise<void>;
}

export interface DaytonaAdapterConfig {
  /** DAYTONA_API_KEY; never read from process.env by the adapter */
  apiKey?: string;
  apiUrl?: string;
  target?: string;
  /** injected factory for tests; production wires the @daytonaio/sdk client */
  createSandbox?: (spec: SandboxSpec) => Promise<DaytonaSandboxLike>;
  log?: (line: string) => void;
}

function makeFs(sandbox: DaytonaSandboxLike, assertLive: () => void): SandboxFs {
  const resolvePath = (p: string) => (p.startsWith("/") ? p : `${DAYTONA_WORKDIR}/${p}`);
  return {
    resolve: resolvePath,
    async read(p) {
      assertLive();
      return sandbox.readFile(resolvePath(p));
    },
    async write(p, bytes) {
      assertLive();
      await sandbox.writeFile(resolvePath(p), bytes);
    },
    async remove(p, opts) {
      assertLive();
      await sandbox.removePath(resolvePath(p), opts);
    },
  };
}

export function createDaytonaProvider(config: DaytonaAdapterConfig): SandboxProvider {
  const log = config.log ?? (() => undefined);
  return {
    id: "daytona",
    async capabilities() {
      return DAYTONA_CAPABILITIES;
    },
    async acquire(spec) {
      if (!config.createSandbox) {
        throw new DaytonaSandboxError(
          "SDK_REQUIRED",
          `daytona adapter requires @daytonaio/sdk@${DAYTONA_SDK_VERSION} or an injected factory`,
        );
      }
      const sandbox = await config.createSandbox(spec);
      let released = false;
      const assertLive = () => {
        if (released) throw new DaytonaSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
        if (sandbox.isStopped()) throw new DaytonaSandboxError("SANDBOX_STOPPED", "daytona sandbox is stopped");
      };
      const handle: SandboxHandle = {
        id: sandbox.id,
        provider: "daytona",
        capabilities: DAYTONA_CAPABILITIES,
        fs: makeFs(sandbox, assertLive),
        async state() {
          return released || sandbox.isStopped() ? "stopped" : "ready";
        },
        async exec(command, opts = {}) {
          assertLive();
          const startedAt = new Date().toISOString();
          const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
          const cwd = opts.cwd
            ? opts.cwd.startsWith("/")
              ? opts.cwd
              : `${DAYTONA_WORKDIR}/${opts.cwd}`
            : DAYTONA_WORKDIR;
          const result = await sandbox.runCommand(text, { cwd, env: opts.env, timeoutMs: opts.timeoutMs });
          return {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            timedOut: false,
            truncated: false,
            startedAt,
            finishedAt: new Date().toISOString(),
            usage: { bytesIn: 0, bytesOut: result.stdout.length + result.stderr.length },
          };
        },
        async snapshot(name) {
          assertLive();
          const snap = await sandbox.snapshot(name ?? `zap-${Date.now()}`);
          log(`daytona snapshot ${snap.id}`);
          return { provider: "daytona", id: snap.id, name, createdAt: new Date().toISOString() };
        },
        async stop() {
          if (released || sandbox.isStopped()) return;
          await sandbox.stop();
          log(`daytona stop ${sandbox.id}`);
        },
        async resume() {
          if (released) throw new DaytonaSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
          if (!sandbox.isStopped()) return;
          await sandbox.start();
          log(`daytona start ${sandbox.id}`);
        },
        async host(port, opts) {
          assertLive();
          const preview = await sandbox.getPreviewLink(port);
          log(`daytona host ${sandbox.id} port ${port}`); // token intentionally omitted (C24)
          return { port, url: preview.url, token: preview.token, isPrivate: opts?.private ?? false };
        },
        async release() {
          if (released) return;
          released = true;
          if (spec.purpose === "run" || spec.purpose === "lane") return;
          await sandbox.delete().catch(() => undefined);
        },
        async captureState() {
          return { provider: "daytona", metadata: { id: sandbox.id } };
        },
      };
      return handle;
    },
    async doctor(): Promise<DoctorReport> {
      const wired = Boolean(config.createSandbox || config.apiKey?.trim());
      return {
        provider: "daytona",
        ok: wired,
        checks: [
          {
            id: "daytona.sdk",
            ok: wired,
            required: true,
            detail: wired
              ? `first-party — @daytonaio/sdk ${DAYTONA_SDK_VERSION}`
              : "first-party — missing DAYTONA_API_KEY / @daytonaio/sdk",
            remediation: wired ? undefined : "set DAYTONA_API_KEY and install @daytonaio/sdk",
          },
        ],
      };
    },
  };
}

const schema = z
  .object({
    apiKey: z.string().optional(),
    apiUrl: z.string().optional(),
    target: z.string().optional(),
  })
  .optional() as z.ZodType<DaytonaAdapterConfig | undefined>;

/** `sandbox.daytona` — container sandboxes with snapshots and preview links via @daytonaio/sdk. */
export const daytonaAdapter = definePlugin<DaytonaAdapterConfig | undefined>({
  name: "sandbox.daytona",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createDaytonaProvider(config ?? {});
    await ctx.effect(() => sandbox.register(provider));
  },
});
