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

export class MicrosandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MicrosandboxError";
    this.code = code;
  }
}

export const MICROSANDBOX_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: false,
  detached: false,
  snapshot: true,
  fork: false,
  stop: true,
  resume: false,
  ports: false,
  privatePorts: false,
  desktop: false,
  ssh: false,
  networkPolicy: "allow-deny",
  gpu: false,
  kvm: true,
  docker: false,
  isolation: "microvm",
  sizes: ["small", "default", "large"],
  maxCommandSeconds: 600,
};

/** Pinned Microsandbox release (npm microsandbox@0.6.15). */
export const MICROSANDBOX_VERSION = "0.6.15";
export const MICROSANDBOX_API_BASE = "https://api.microsandbox.dev/v1";

/** Structural slice of the microsandbox SDK surface this adapter uses. */
export interface MsbSandboxLike {
  exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  snapshot(name: string): Promise<{ id: string }>;
  stop(): Promise<void>;
  readFile(path: string): Promise<string | null>;
  writeFile(path: string, content: string): Promise<void>;
  removePath(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  id: string;
}

export interface MicrosandboxAdapterConfig {
  /** MSB_API_KEY for the cloud backend; local msb servers need none */
  apiKey?: string;
  baseUrl?: string;
  image?: string;
  /** injected factory for tests; production wires the msb SDK builder */
  createSandbox?: (spec: SandboxSpec) => Promise<MsbSandboxLike>;
}

function makeFs(sandbox: MsbSandboxLike, assertLive: () => void): SandboxFs {
  const resolvePath = (p: string) => (p.startsWith("/") ? p : `/workspace/${p}`);
  return {
    resolve: resolvePath,
    async read(p) {
      assertLive();
      const content = await sandbox.readFile(resolvePath(p));
      return content === null ? null : new TextEncoder().encode(content);
    },
    async write(p, bytes) {
      assertLive();
      await sandbox.writeFile(resolvePath(p), new TextDecoder().decode(bytes));
    },
    async remove(p, opts) {
      assertLive();
      await sandbox.removePath(resolvePath(p), opts);
    },
  };
}

export function createMicrosandboxProvider(config: MicrosandboxAdapterConfig): SandboxProvider {
  return {
    id: "microsandbox",
    async capabilities() {
      return MICROSANDBOX_CAPABILITIES;
    },
    async acquire(spec) {
      if (!config.createSandbox) {
        throw new MicrosandboxError(
          "SDK_REQUIRED",
          `microsandbox adapter requires the msb SDK (microsandbox@${MICROSANDBOX_VERSION}) or an injected factory`,
        );
      }
      const sandbox = await config.createSandbox(spec);
      let released = false;
      let stopped = false;
      const assertLive = () => {
        if (released) throw new MicrosandboxError("SANDBOX_RELEASED", "sandbox handle was released");
        if (stopped) throw new MicrosandboxError("SANDBOX_STOPPED", "microsandbox is stopped");
      };
      const handle: SandboxHandle = {
        id: sandbox.id,
        provider: "microsandbox",
        capabilities: MICROSANDBOX_CAPABILITIES,
        fs: makeFs(sandbox, assertLive),
        async state() {
          return released || stopped ? "stopped" : "ready";
        },
        async exec(command, opts = {}) {
          assertLive();
          const startedAt = new Date().toISOString();
          const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
          const prefix = opts.cwd ? `cd ${JSON.stringify(opts.cwd)} && ` : "";
          const result = await sandbox.exec(`${prefix}${text}`);
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
          return { provider: "microsandbox", id: snap.id, name, createdAt: new Date().toISOString() };
        },
        async stop() {
          if (released || stopped) return;
          stopped = true;
          await sandbox.stop();
        },
        async release() {
          if (released) return;
          released = true;
          if (spec.purpose === "run" || spec.purpose === "lane") return;
          if (!stopped) await sandbox.stop().catch(() => undefined);
        },
        async captureState() {
          return { provider: "microsandbox", metadata: { id: sandbox.id } };
        },
      };
      return handle;
    },
    async doctor(): Promise<DoctorReport> {
      const wired = Boolean(config.createSandbox || config.apiKey?.trim());
      return {
        provider: "microsandbox",
        ok: wired,
        checks: [
          {
            id: "microsandbox.sdk",
            ok: wired,
            required: true,
            detail: wired ? `msb ${MICROSANDBOX_VERSION}` : "missing MSB_API_KEY / msb install",
            remediation: wired ? undefined : "run infra/self-host/setup.sh or set MSB_API_KEY",
          },
        ],
      };
    },
  };
}

const schema = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  image: z.string().optional(),
}).optional() as z.ZodType<MicrosandboxAdapterConfig | undefined>;

/** `sandbox.microsandbox` — KVM microVMs via msb. */
export const microsandboxAdapter = definePlugin<MicrosandboxAdapterConfig | undefined>({
  name: "sandbox.microsandbox",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createMicrosandboxProvider(config ?? {});
    await ctx.effect(() => sandbox.register(provider));
  },
});
