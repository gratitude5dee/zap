import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type {
  DoctorReport,
  ExecOptions,
  ExecResult,
  LaneExecutor,
  SandboxCapabilities,
  SandboxFs,
  SandboxHandle,
  SandboxProvider,
  SandboxService,
  SandboxSpec,
} from "../../contract.ts";
import { localSandboxAllowed, type SandboxEnv } from "../../env.ts";

export class LocalSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LocalSandboxError";
    this.code = code;
  }
}

export const LOCAL_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: true,
  detached: false,
  snapshot: false,
  fork: false,
  stop: false,
  resume: false,
  ports: false,
  privatePorts: false,
  desktop: false,
  ssh: false,
  networkPolicy: "none",
  gpu: false,
  kvm: false,
  docker: false,
  isolation: "none",
  sizes: ["default"],
  maxCommandSeconds: 3600,
};

export const LOCAL_FS_ROOT = "/zap/fs";

export interface LocalAdapterConfig {
  /** filesystem root; defaults to /zap/fs (tests remap to a tmpdir) */
  root?: string;
  /** lane executor for exec calls with opts.lane; the `lanes` service */
  lanes?: LaneExecutor;
  env?: SandboxEnv;
}

function runBash(command: string, opts: ExecOptions, cwd: string): Promise<ExecResult> {
  return new Promise((resolvePromise) => {
    const startedAt = new Date().toISOString();
    const child = spawn("bash", ["-lc", command], {
      cwd,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
        ...opts.env,
      },
      stdio: ["pipe", "pipe", "pipe"] as const,
      signal: opts.signal,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    if (opts.stdin) child.stdin.write(opts.stdin);
    child.stdin.end();
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout,
        stderr,
        timedOut,
        truncated: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        usage: { bytesIn: opts.stdin?.length ?? 0, bytesOut: stdout.length + stderr.length },
      });
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolvePromise({
        exitCode: 127,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut,
        truncated: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        usage: { bytesIn: 0, bytesOut: 0 },
      });
    });
  });
}

function makeLocalFs(root: string, assertLive: () => void): SandboxFs {
  const resolvePath = (p: string) => {
    const abs = path.resolve(root, p.startsWith("/") ? `.${p}` : p);
    if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
      throw new LocalSandboxError("PATH_ESCAPE", `path ${p} escapes the sandbox root`);
    }
    return abs;
  };
  return {
    resolve: (p) => resolvePath(p),
    async read(p) {
      assertLive();
      try {
        return new Uint8Array(await readFile(resolvePath(p)));
      } catch {
        return null;
      }
    },
    async write(p, bytes) {
      assertLive();
      const abs = resolvePath(p);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, bytes);
    },
    async readdir(p) {
      assertLive();
      const abs = resolvePath(p);
      const entries = await readdir(abs, { withFileTypes: true });
      const out: Array<{ name: string; type: "file" | "dir" | "symlink"; size?: number }> = [];
      for (const entry of entries) {
        const type = entry.isDirectory() ? "dir" : entry.isSymbolicLink() ? "symlink" : "file";
        const size = type === "file" ? (await stat(path.join(abs, entry.name))).size : undefined;
        out.push({ name: entry.name, type, size });
      }
      return out;
    },
    async remove(p, opts) {
      assertLive();
      await rm(resolvePath(p), { recursive: opts?.recursive ?? false, force: opts?.force ?? false });
    },
  };
}

/** The single handle for this VM (§4.1) — the machine cannot operate on itself. */
export function createLocalHandle(config?: LocalAdapterConfig): SandboxHandle {
  const root = config?.root ?? LOCAL_FS_ROOT;
  let released = false;
  const assertLive = () => {
    if (released) throw new LocalSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
  };
  return {
    id: "local",
    provider: "local",
    capabilities: LOCAL_CAPABILITIES,
    fs: makeLocalFs(root, assertLive),
    async state() {
      return released ? "stopped" : "ready";
    },
    async exec(command, opts = {}) {
      assertLive();
      if (opts.lane) {
        if (typeof command === "string") {
          throw new LocalSandboxError("LANE_REQUIRES_ARGV", "lane exec requires an argv array, not a shell string");
        }
        const lanes = config?.lanes;
        if (!lanes) {
          throw new LocalSandboxError("LANES_UNAVAILABLE", "no lane executor is configured for sandbox.local");
        }
        const run = await lanes.run({
          lane: opts.lane,
          argv: command,
          cwd: opts.cwd,
          env: opts.env,
          timeoutMs: opts.timeoutMs,
          signal: opts.signal,
        });
        const { id: _id, isolation: _isolation, lane: _lane, ...rest } = run;
        return rest;
      }
      const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
      await mkdir(root, { recursive: true });
      const cwd = opts.cwd ? makeLocalFs(root, assertLive).resolve(opts.cwd) : root;
      await mkdir(cwd, { recursive: true });
      return runBash(text, opts, cwd);
    },
    async release() {
      released = true;
    },
    async captureState() {
      return { provider: "local", metadata: { root } };
    },
  };
}

export function createLocalProvider(config?: LocalAdapterConfig): SandboxProvider {
  if (!localSandboxAllowed(config?.env)) {
    throw new LocalSandboxError(
      "LOCAL_SANDBOX_FORBIDDEN",
      "sandbox.local mounts only under zap-agentd serve (RUNTIME_TOKEN/ZAP_SELFHOST_TOKEN) or with ZAP_ALLOW_LOCAL_SANDBOX=1",
    );
  }
  let handle: SandboxHandle | undefined;
  return {
    id: "local",
    async capabilities() {
      return LOCAL_CAPABILITIES;
    },
    async acquire(_spec: SandboxSpec) {
      handle ??= createLocalHandle(config);
      return handle;
    },
    async doctor(): Promise<DoctorReport> {
      const root = config?.root ?? LOCAL_FS_ROOT;
      let writable = false;
      try {
        await mkdir(root, { recursive: true });
        writable = true;
      } catch {
        writable = false;
      }
      return {
        provider: "local",
        ok: writable,
        checks: [
          { id: "local.fs", ok: writable, required: true, detail: `${root} writable` },
          { id: "local.lanes", ok: Boolean(config?.lanes), required: false, detail: "lane executor wired" },
        ],
      };
    },
  };
}

const schema = z
  .object({
    root: z.string().optional(),
    env: z.record(z.string(), z.string().optional()).optional(),
  })
  .optional() as z.ZodType<LocalAdapterConfig | undefined>;

/** `sandbox.local` — the in-VM kernel's own machine. */
export const localAdapter = definePlugin<LocalAdapterConfig | undefined>({
  name: "sandbox.local",
  inject: ["sandbox"],
  optionalInject: ["lanes", "meter"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const lanes = config?.lanes ?? ctx.get<LaneExecutor>("lanes");
    const provider = createLocalProvider({ ...config, lanes });
    await ctx.effect(() => sandbox.register(provider));
  },
});
