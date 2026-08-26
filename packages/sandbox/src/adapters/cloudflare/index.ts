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

export class CloudflareSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CloudflareSandboxError";
    this.code = code;
  }
}

/** Default working directory inside a Cloudflare sandbox container. */
export const CLOUDFLARE_WORKDIR = "/workspace";
/** Pinned SDK release the adapter is written against (npm @cloudflare/sandbox). */
export const CLOUDFLARE_SDK_VERSION = "0.4.3";

export const CLOUDFLARE_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: false,
  detached: false,
  snapshot: true,
  fork: false,
  stop: false,
  resume: false,
  ports: true,
  privatePorts: false,
  desktop: false,
  ssh: false,
  networkPolicy: "none",
  gpu: false,
  kvm: false,
  docker: false,
  isolation: "container",
  sizes: ["default"],
  maxCommandSeconds: 600,
};

/** Structural slice of the @cloudflare/sandbox surface this adapter uses. */
export interface CloudflareSandboxLike {
  id: string;
  exec(
    command: string,
    opts?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  removePath(path: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>;
  exposePort(port: number): Promise<{ url: string }>;
  /** createBackup — the snapshot primitive; restoreBackup rehydrates a new sandbox. */
  createBackup(): Promise<{ id: string }>;
  destroy(): Promise<void>;
}

export interface CloudflareAdapterConfig {
  /** Workers binding name for the Sandbox durable object */
  binding?: string;
  /** injected factory for tests; production wires getSandbox(env.BINDING, id) */
  getSandbox?: (spec: SandboxSpec) => Promise<CloudflareSandboxLike>;
}

function makeFs(sandbox: CloudflareSandboxLike, assertLive: () => void): SandboxFs {
  const resolvePath = (p: string) => (p.startsWith("/") ? p : `${CLOUDFLARE_WORKDIR}/${p}`);
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

export function createCloudflareProvider(config: CloudflareAdapterConfig): SandboxProvider {
  return {
    id: "cloudflare",
    async capabilities() {
      return CLOUDFLARE_CAPABILITIES;
    },
    async acquire(spec) {
      if (!config.getSandbox) {
        throw new CloudflareSandboxError(
          "SDK_REQUIRED",
          `cloudflare adapter requires @cloudflare/sandbox@${CLOUDFLARE_SDK_VERSION} (getSandbox) or an injected factory`,
        );
      }
      const sandbox = await config.getSandbox(spec);
      let released = false;
      const assertLive = () => {
        if (released) throw new CloudflareSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
      };
      const handle: SandboxHandle = {
        id: sandbox.id,
        provider: "cloudflare",
        capabilities: CLOUDFLARE_CAPABILITIES,
        fs: makeFs(sandbox, assertLive),
        async state() {
          return released ? "stopped" : "ready";
        },
        async exec(command, opts = {}) {
          assertLive();
          const startedAt = new Date().toISOString();
          const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
          const cwd = opts.cwd
            ? opts.cwd.startsWith("/")
              ? opts.cwd
              : `${CLOUDFLARE_WORKDIR}/${opts.cwd}`
            : CLOUDFLARE_WORKDIR;
          const result = await sandbox.exec(text, { cwd, env: opts.env, timeoutMs: opts.timeoutMs });
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
          const backup = await sandbox.createBackup();
          return { provider: "cloudflare", id: backup.id, name, createdAt: new Date().toISOString() };
        },
        async host(port) {
          assertLive();
          const exposed = await sandbox.exposePort(port);
          return { port, url: exposed.url, isPrivate: false };
        },
        async release() {
          if (released) return;
          released = true;
          if (spec.purpose === "run" || spec.purpose === "lane") return;
          await sandbox.destroy().catch(() => undefined);
        },
        async captureState() {
          return { provider: "cloudflare", metadata: { id: sandbox.id } };
        },
      };
      return handle;
    },
    async doctor(): Promise<DoctorReport> {
      const wired = Boolean(config.getSandbox || config.binding?.trim());
      return {
        provider: "cloudflare",
        ok: wired,
        checks: [
          {
            id: "cloudflare.sdk",
            ok: wired,
            required: true,
            detail: wired
              ? `first-party — @cloudflare/sandbox ${CLOUDFLARE_SDK_VERSION}`
              : "first-party — missing Sandbox durable-object binding / @cloudflare/sandbox",
            remediation: wired
              ? undefined
              : "add a Sandbox durable-object binding to wrangler.toml and install @cloudflare/sandbox",
          },
        ],
      };
    },
  };
}

const schema = z
  .object({
    binding: z.string().optional(),
  })
  .optional() as z.ZodType<CloudflareAdapterConfig | undefined>;

/** `sandbox.cloudflare` — container sandboxes on Workers via @cloudflare/sandbox (getSandbox/exec/exposePort/createBackup). */
export const cloudflareAdapter = definePlugin<CloudflareAdapterConfig | undefined>({
  name: "sandbox.cloudflare",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createCloudflareProvider(config ?? {});
    await ctx.effect(() => sandbox.register(provider));
  },
});
