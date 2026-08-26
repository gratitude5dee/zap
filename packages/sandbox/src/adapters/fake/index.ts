import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type {
  DoctorReport,
  ExecOptions,
  ExecResult,
  HostedPort,
  SandboxCapabilities,
  SandboxFs,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
  SnapshotRef,
} from "../../contract.ts";
import { fakeSandboxAllowed, type SandboxEnv } from "../../env.ts";

export class FakeSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FakeSandboxError";
    this.code = code;
  }
}

export const FAKE_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: true,
  detached: false,
  snapshot: true,
  fork: true,
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
  isolation: "process",
  sizes: ["small", "default", "large"],
  maxCommandSeconds: 300,
};

type FileMap = Map<string, Uint8Array>;

interface FakeVm {
  id: string;
  files: FileMap;
  state: "ready" | "stopped";
  hosted: Map<number, HostedPort>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let counter = 0;
const snapshots = new Map<string, FileMap>();

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}-${Date.now().toString(36)}`;
}

function normalize(path: string, cwd = "/workspace"): string {
  const joined = path.startsWith("/") ? path : `${cwd}/${path}`;
  const parts: string[] = [];
  for (const part of joined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function result(partial: Partial<ExecResult>): ExecResult {
  const now = new Date().toISOString();
  return {
    exitCode: 0,
    stdout: "",
    stderr: "",
    timedOut: false,
    truncated: false,
    startedAt: now,
    finishedAt: now,
    usage: { bytesIn: 0, bytesOut: 0 },
    ...partial,
  };
}

function substitute(text: string, env: Record<string, string>): string {
  return text.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (_, name: string) => env[name] ?? "");
}

/**
 * Interprets the small command language the conformance suite uses:
 * `mkdir -p`, `tr SET1 SET2 < in > out`, `printf FMT ARG >> out`,
 * `echo`, `cat`, `sleep`, `pwd`, `true`, `false`, joined with `&&`.
 */
function runCommand(vm: FakeVm, command: string, opts: ExecOptions): ExecResult {
  const cwd = opts.cwd ? normalize(opts.cwd) : "/workspace";
  const env = opts.env ?? {};
  const started = new Date().toISOString();
  let stdout = "";
  for (const raw of command.split("&&")) {
    const segment = raw.trim();
    if (!segment || segment === "true" || segment === ":") continue;
    if (segment === "false") return result({ exitCode: 1, startedAt: started });
    if (segment === "pwd") {
      stdout += `${cwd}\n`;
      continue;
    }
    const sleep = segment.match(/^sleep\s+([\d.]+)$/);
    if (sleep) {
      const ms = Number(sleep[1]) * 1000;
      if (opts.timeoutMs !== undefined && ms > opts.timeoutMs) {
        return result({ exitCode: 124, timedOut: true, startedAt: started });
      }
      continue;
    }
    const mkdir = segment.match(/^mkdir\s+(?:-p\s+)?(.+)$/);
    if (mkdir) continue; // directories are implicit in the in-memory map
    const echo = segment.match(/^echo\s+(?:"([^"]*)"|'([^']*)'|(.*))$/);
    if (echo) {
      stdout += `${substitute(echo[1] ?? echo[2] ?? echo[3] ?? "", env)}\n`;
      continue;
    }
    const cat = segment.match(/^cat\s+(\S+)$/);
    if (cat) {
      const bytes = vm.files.get(normalize(cat[1], cwd));
      if (!bytes) return result({ exitCode: 1, stderr: `cat: ${cat[1]}: No such file`, startedAt: started });
      stdout += decoder.decode(bytes);
      continue;
    }
    const tr = segment.match(/^tr\s+'([^']+)'\s+'([^']+)'\s*<\s*(\S+)\s*>\s*(\S+)$/);
    if (tr) {
      const input = vm.files.get(normalize(tr[3], cwd));
      if (!input) return result({ exitCode: 1, stderr: `tr: ${tr[3]}: No such file`, startedAt: started });
      const text = decoder.decode(input);
      const translated = tr[1] === "a-z" && tr[2] === "A-Z"
        ? text.toUpperCase()
        : tr[1] === "A-Z" && tr[2] === "a-z"
          ? text.toLowerCase()
          : text;
      vm.files.set(normalize(tr[4], cwd), encoder.encode(translated));
      continue;
    }
    const printf = segment.match(/^printf\s+'([^']*)'\s+(?:"([^"]*)"|'([^']*)'|(\S+))\s*(>>?)\s*(\S+)$/);
    if (printf) {
      const arg = substitute(printf[2] ?? printf[3] ?? printf[4] ?? "", env);
      const rendered = printf[1].replace("%s", arg);
      const target = normalize(printf[6], cwd);
      const prior = printf[5] === ">>" ? (vm.files.get(target) ?? new Uint8Array()) : new Uint8Array();
      const merged = new Uint8Array(prior.length + rendered.length);
      merged.set(prior);
      merged.set(encoder.encode(rendered), prior.length);
      vm.files.set(target, merged);
      continue;
    }
    return result({ exitCode: 127, stderr: `fake sandbox: unsupported command: ${segment}`, startedAt: started });
  }
  return result({ stdout, startedAt: started, usage: { bytesIn: 0, bytesOut: stdout.length } });
}

function makeFs(vm: FakeVm, assertLive: () => void): SandboxFs {
  return {
    resolve: (path) => normalize(path),
    async read(path) {
      assertLive();
      return vm.files.get(normalize(path)) ?? null;
    },
    async write(path, bytes) {
      assertLive();
      vm.files.set(normalize(path), bytes);
    },
    async readdir(path) {
      assertLive();
      const prefix = `${normalize(path)}/`;
      const names = new Map<string, "file" | "dir">();
      for (const key of vm.files.keys()) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1) names.set(rest, "file");
        else names.set(rest.slice(0, slash), "dir");
      }
      return [...names.entries()].map(([name, type]) => ({ name, type }));
    },
    async remove(path, opts) {
      assertLive();
      const target = normalize(path);
      let found = false;
      for (const key of [...vm.files.keys()]) {
        if (key === target || (opts?.recursive && key.startsWith(`${target}/`))) {
          vm.files.delete(key);
          found = true;
        }
      }
      if (!found && !opts?.force) {
        throw new FakeSandboxError("ENOENT", `remove: ${path} does not exist`);
      }
    },
  };
}

export function createFakeHandle(spec: SandboxSpec, seed?: FileMap): SandboxHandle {
  const vm: FakeVm = {
    id: spec.existing?.id ?? nextId("fake"),
    files: seed ? new Map(seed) : new Map(),
    state: "ready",
    hosted: new Map(),
  };
  let released = false;
  const assertLive = () => {
    if (released) throw new FakeSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
    if (vm.state === "stopped") throw new FakeSandboxError("SANDBOX_STOPPED", "sandbox is stopped");
  };
  const handle: SandboxHandle = {
    id: vm.id,
    provider: "fake",
    capabilities: FAKE_CAPABILITIES,
    fs: makeFs(vm, assertLive),
    async state() {
      return released ? "stopped" : vm.state;
    },
    async exec(command, opts = {}) {
      assertLive();
      const text = typeof command === "string" ? command : command.join(" ");
      return runCommand(vm, text, opts);
    },
    async snapshot(name) {
      assertLive();
      const id = nextId("snap");
      snapshots.set(id, new Map(vm.files));
      const ref: SnapshotRef = { provider: "fake", id, name, createdAt: new Date().toISOString() };
      return ref;
    },
    async fork(forkSpec) {
      assertLive();
      return createFakeHandle(
        { ...spec, ...forkSpec, provider: "fake", existing: undefined },
        new Map(vm.files),
      );
    },
    async stop() {
      if (released) return;
      vm.state = "stopped";
    },
    async resume() {
      if (released) throw new FakeSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
      vm.state = "ready";
      for (const [port, hosted] of vm.hosted) {
        vm.hosted.set(port, { ...hosted, token: nextId("token") });
      }
    },
    async host(port, opts) {
      assertLive();
      const hosted: HostedPort = {
        port,
        url: `https://${vm.id}-${port}.sandbox.zap.invalid`,
        token: nextId("token"),
        isPrivate: opts?.private ?? false,
      };
      vm.hosted.set(port, hosted);
      return hosted;
    },
    async release() {
      if (released) return;
      released = true;
      if (spec.purpose === "test") {
        vm.files.clear();
      }
      vm.state = spec.purpose === "run" || spec.purpose === "lane" ? vm.state : "stopped";
    },
    async captureState() {
      return { provider: "fake", metadata: { id: vm.id, state: vm.state } };
    },
  };
  return handle;
}

export interface FakeAdapterConfig {
  env?: SandboxEnv;
}

export function createFakeProvider(config?: FakeAdapterConfig): SandboxProvider {
  if (!fakeSandboxAllowed(config?.env)) {
    throw new FakeSandboxError(
      "FAKE_SANDBOX_FORBIDDEN",
      "the fake sandbox adapter mounts only with ZAP_ALLOW_FAKE_SANDBOX=1",
    );
  }
  return {
    id: "fake",
    async capabilities() {
      return FAKE_CAPABILITIES;
    },
    async acquire(spec) {
      const seed = spec.template ? snapshots.get(spec.template) : undefined;
      return createFakeHandle(spec, seed);
    },
    async doctor(): Promise<DoctorReport> {
      return {
        provider: "fake",
        ok: true,
        checks: [{ id: "fake.gate", ok: true, required: true, detail: "ZAP_ALLOW_FAKE_SANDBOX=1" }],
      };
    },
  };
}

const schema = z.object({ env: z.record(z.string(), z.string().optional()).optional() }).optional() as z.ZodType<
  FakeAdapterConfig | undefined
>;

/** `sandbox.fake` — in-memory adapter for CI; mounts only with ZAP_ALLOW_FAKE_SANDBOX=1. */
export const fakeAdapter = definePlugin<FakeAdapterConfig | undefined>({
  name: "sandbox.fake",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<import("../../contract.ts").SandboxService>("sandbox");
    const provider = createFakeProvider(config);
    await ctx.effect(() => sandbox.register(provider));
  },
});
