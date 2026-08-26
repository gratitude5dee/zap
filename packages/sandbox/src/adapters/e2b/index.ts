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

export class E2BSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "E2BSandboxError";
    this.code = code;
  }
}

/** Default working directory inside an E2B sandbox. */
export const E2B_WORKDIR = "/home/user";
/** Pinned SDK release the adapter is written against (npm e2b@2.x). */
export const E2B_SDK_VERSION = "2.6.4";

export const E2B_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: false,
  detached: false,
  snapshot: true,
  fork: false,
  stop: true,
  resume: true,
  ports: true,
  privatePorts: false,
  desktop: false,
  ssh: false,
  networkPolicy: "none",
  gpu: false,
  kvm: false,
  docker: false,
  isolation: "microvm",
  sizes: ["small", "default", "large"],
  maxCommandSeconds: 600,
};

/** Structural slice of the e2b SDK surface this adapter uses. */
export interface E2BSandboxLike {
  id: string;
  runCommand(
    command: string,
    opts?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  removePath(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  /** Sandbox.pause — persists the filesystem and returns the resumable sandbox id. */
  pause(): Promise<string>;
  kill(): Promise<void>;
  getHost?(port: number): Promise<string>;
}

export interface E2BAdapterConfig {
  /** E2B_API_KEY; never read from process.env by the adapter */
  apiKey?: string;
  template?: string;
  /** injected factories for tests; production wires the e2b SDK */
  createSandbox?: (spec: SandboxSpec) => Promise<E2BSandboxLike>;
  /** Sandbox.connect — resumes a paused sandbox by id. */
  connectSandbox?: (id: string) => Promise<E2BSandboxLike>;
}

function makeFs(current: () => E2BSandboxLike, assertLive: () => void): SandboxFs {
  const resolvePath = (p: string) => (p.startsWith("/") ? p : `${E2B_WORKDIR}/${p}`);
  return {
    resolve: resolvePath,
    async read(p) {
      assertLive();
      return current().readFile(resolvePath(p));
    },
    async write(p, bytes) {
      assertLive();
      await current().writeFile(resolvePath(p), bytes);
    },
    async remove(p, opts) {
      assertLive();
      await current().removePath(resolvePath(p), opts);
    },
  };
}

export function createE2BProvider(config: E2BAdapterConfig): SandboxProvider {
  return {
    id: "e2b",
    async capabilities() {
      return E2B_CAPABILITIES;
    },
    async acquire(spec) {
      if (!config.createSandbox) {
        throw new E2BSandboxError(
          "SDK_REQUIRED",
          `e2b adapter requires the e2b SDK (e2b@${E2B_SDK_VERSION}) or an injected factory`,
        );
      }
      let sandbox = await config.createSandbox(spec);
      let released = false;
      let paused = false;
      let pausedId: string | undefined;
      const assertLive = () => {
        if (released) throw new E2BSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
        if (paused) throw new E2BSandboxError("SANDBOX_STOPPED", "e2b sandbox is paused");
      };
      const handle: SandboxHandle = {
        id: sandbox.id,
        provider: "e2b",
        capabilities: E2B_CAPABILITIES,
        fs: makeFs(() => sandbox, assertLive),
        async state() {
          return released || paused ? "stopped" : "ready";
        },
        async exec(command, opts = {}) {
          assertLive();
          const startedAt = new Date().toISOString();
          const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
          const cwd = opts.cwd ? (opts.cwd.startsWith("/") ? opts.cwd : `${E2B_WORKDIR}/${opts.cwd}`) : E2B_WORKDIR;
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
          if (!config.connectSandbox) {
            throw new E2BSandboxError("SDK_REQUIRED", "e2b snapshot requires Sandbox.connect to resume after pause");
          }
          const id = await sandbox.pause();
          sandbox = await config.connectSandbox(id);
          return { provider: "e2b", id, name, createdAt: new Date().toISOString() };
        },
        async stop() {
          if (released || paused) return;
          pausedId = await sandbox.pause();
          paused = true;
        },
        async resume() {
          if (released) throw new E2BSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
          if (!paused) return;
          if (!config.connectSandbox) {
            throw new E2BSandboxError("SDK_REQUIRED", "e2b resume requires Sandbox.connect");
          }
          sandbox = await config.connectSandbox(pausedId ?? sandbox.id);
          paused = false;
        },
        async host(port) {
          assertLive();
          if (!sandbox.getHost) {
            throw new E2BSandboxError("PORTS_UNSUPPORTED", "this e2b sandbox does not expose getHost");
          }
          const url = await sandbox.getHost(port);
          return { port, url, isPrivate: false };
        },
        async release() {
          if (released) return;
          released = true;
          if (spec.purpose === "run" || spec.purpose === "lane") return;
          if (!paused) await sandbox.kill().catch(() => undefined);
        },
        async captureState() {
          return { provider: "e2b", metadata: { id: sandbox.id, pausedId: pausedId ?? null } };
        },
      };
      return handle;
    },
    async doctor(): Promise<DoctorReport> {
      const wired = Boolean(config.createSandbox || config.apiKey?.trim());
      return {
        provider: "e2b",
        ok: wired,
        checks: [
          {
            id: "e2b.sdk",
            ok: wired,
            required: true,
            detail: wired
              ? `first-party — e2b ${E2B_SDK_VERSION}`
              : "first-party — missing E2B_API_KEY / e2b SDK",
            remediation: wired ? undefined : "set E2B_API_KEY and install e2b",
          },
        ],
      };
    },
  };
}

const schema = z
  .object({
    apiKey: z.string().optional(),
    template: z.string().optional(),
  })
  .optional() as z.ZodType<E2BAdapterConfig | undefined>;

/** `sandbox.e2b` — Firecracker microVMs via the e2b SDK (Sandbox.create/connect/pause). */
export const e2bAdapter = definePlugin<E2BAdapterConfig | undefined>({
  name: "sandbox.e2b",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createE2BProvider(config ?? {});
    await ctx.effect(() => sandbox.register(provider));
  },
});
