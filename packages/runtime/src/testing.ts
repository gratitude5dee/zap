// In-process fakes so sessions C, D, E, G, K can test gates, renders and CLI
// plumbing before the real sandbox/pay/meter/gateway providers land.
import type { MeterLine, MeterUnit } from "@wzrdtech/core";
import type {
  DoctorReport,
  ExecOptions,
  ExecResult,
  SandboxCapabilities,
  SandboxFs,
  SandboxHandle,
  SandboxProvider,
  SandboxService,
  SandboxSpec,
} from "@wzrdtech/zap-sandbox";
import type { Context, Disposer } from "@wzrdtech/zap-kernel";
import type { AgentdApp, AgentdRequest, AgentdResponse, AgentdRouteModule } from "./agentd/routes.ts";

export type PayerMode = "missing" | "byok" | "managed";

export interface PayService {
  status(): PayerMode;
  payer(): { mode: PayerMode; address?: string } | null;
}

export interface MeterService {
  quote(plan: { lines: Array<Omit<MeterLine, "usd">> }): Promise<{ usd: number; lines: MeterLine[]; creditApplied: number }>;
  record(line: MeterLine): void;
  lines(): readonly MeterLine[];
}

export interface FakeGatewayFixture {
  completions?: Record<string, string>;
  prices?: Partial<Record<MeterUnit, number>>;
}

export interface GatewayServiceLike {
  complete(model: string, prompt: string): Promise<string>;
  quoteUsd(unit: MeterUnit, qty: number): number;
}

const FAKE_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: true,
  detached: false,
  snapshot: true,
  fork: true,
  stop: true,
  resume: true,
  ports: false,
  privatePorts: false,
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

class FakeSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FakeSandboxError";
    this.code = code;
  }
}

function execResult(partial: Partial<ExecResult>): ExecResult {
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

function makeFakeHandle(spec: SandboxSpec): SandboxHandle {
  const files = new Map<string, Uint8Array>();
  let released = false;
  let stopped = false;
  const workdir = "/zap/fake";

  const fs: SandboxFs = {
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, bytes) {
      files.set(path, bytes);
    },
    async readdir(path) {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      return [...files.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ name: key.slice(prefix.length), type: "file" as const, size: files.get(key)?.byteLength }));
    },
    async remove(path, opts) {
      if (opts?.recursive) {
        for (const key of [...files.keys()]) {
          if (key === path || key.startsWith(`${path}/`)) files.delete(key);
        }
        return;
      }
      files.delete(path);
    },
    resolve(path) {
      return path.startsWith("/") ? path : `${workdir}/${path}`;
    },
  };

  return {
    id: `fake-${spec.idempotencyKey}`,
    provider: "fake",
    capabilities: FAKE_CAPABILITIES,
    async state() {
      return stopped ? "stopped" : "ready";
    },
    async exec(command: string | readonly string[], opts?: ExecOptions) {
      if (released) throw new FakeSandboxError("SANDBOX_RELEASED", "exec after release");
      void opts;
      const argv = typeof command === "string" ? ["bash", "-lc", command] : [...command];
      return execResult({ stdout: `fake:${argv.join(" ")}` });
    },
    fs,
    async snapshot(name?: string) {
      return { provider: "fake", id: `snap-${name ?? "anon"}`, name, createdAt: new Date().toISOString() };
    },
    async stop() {
      stopped = true;
    },
    async resume() {
      stopped = false;
    },
    async release() {
      released = true;
    },
    async captureState() {
      return { provider: "fake", metadata: { files: files.size } };
    },
  };
}

export function fakeSandboxService(): SandboxService {
  const providers = new Map<string, SandboxProvider>();
  const fakeProvider: SandboxProvider = {
    id: "fake",
    async capabilities() {
      return FAKE_CAPABILITIES;
    },
    async acquire(spec: SandboxSpec) {
      return makeFakeHandle(spec);
    },
    async doctor(): Promise<DoctorReport> {
      return { provider: "fake", ok: true, checks: [{ id: "fake", ok: true, required: false }] };
    },
  };
  providers.set("fake", fakeProvider);

  return {
    register(provider: SandboxProvider): Disposer {
      providers.set(provider.id, provider);
      return () => {
        providers.delete(provider.id);
      };
    },
    async acquire(spec: SandboxSpec) {
      const provider = providers.get(spec.provider) ?? fakeProvider;
      return provider.acquire(spec);
    },
    providers() {
      return [...providers.keys()] as ReturnType<SandboxService["providers"]>;
    },
    default: "fake",
  };
}

export function fakePayService(options: { mode: PayerMode }): PayService {
  return {
    status() {
      return options.mode;
    },
    payer() {
      return options.mode === "missing" ? null : { mode: options.mode, address: "0xfake" };
    },
  };
}

export function fakeMeterService(): MeterService {
  const recorded: MeterLine[] = [];
  return {
    async quote(plan) {
      const lines = plan.lines.map((line) => ({ ...line, usd: 0 }));
      return { usd: 0, lines, creditApplied: 0 };
    },
    record(line) {
      recorded.push(line);
    },
    lines() {
      return recorded;
    },
  };
}

export function fakeGateway(fixture: FakeGatewayFixture = {}): GatewayServiceLike {
  return {
    async complete(model, prompt) {
      return fixture.completions?.[model] ?? `fake-completion:${model}:${prompt.slice(0, 32)}`;
    },
    quoteUsd(unit, qty) {
      return (fixture.prices?.[unit] ?? 0) * qty;
    },
  };
}

export interface FakeAgentd {
  app: AgentdApp;
  mount(module: AgentdRouteModule, ctx: Context): Disposer;
  request(req: Omit<AgentdRequest, "params"> & { params?: Record<string, string> }): Promise<AgentdResponse>;
  dispose(): void;
}

/**
 * In-process zap-agentd over the fake sandbox (ZAP_ALLOW_FAKE_SANDBOX=1),
 * hosting route modules so /v1/runs and /v1/sessions can be tested before
 * serve.ts lands.
 */
export function fakeAgentd(): FakeAgentd {
  interface RouteEntry {
    method: string;
    path: string;
    handler: (req: AgentdRequest) => Promise<AgentdResponse> | AgentdResponse;
  }
  let routes: RouteEntry[] = [];
  const app: AgentdApp = {
    route(method, path, handler) {
      routes.push({ method, path, handler });
    },
  };

  function match(pattern: string, path: string): Record<string, string> | null {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);
    if (patternParts.length !== pathParts.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i += 1) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];
      if (patternPart === undefined || pathPart === undefined) return null;
      if (patternPart.startsWith(":")) params[patternPart.slice(1)] = pathPart;
      else if (patternPart !== pathPart) return null;
    }
    return params;
  }

  return {
    app,
    mount(module, ctx) {
      const before = routes.length;
      const disposer = module.mount(
        {
          route(method, path, handler) {
            app.route(method, `${module.prefix}${path}`, handler);
          },
        },
        ctx,
      );
      const added = routes.slice(before);
      return () => {
        disposer();
        routes = routes.filter((entry) => !added.includes(entry));
      };
    },
    async request(req) {
      for (const entry of routes) {
        if (entry.method !== req.method) continue;
        const params = match(entry.path, req.path);
        if (!params) continue;
        return entry.handler({ ...req, params: { ...params, ...req.params } });
      }
      return { status: 404, body: { error: "NOT_FOUND", path: req.path } };
    },
    dispose() {
      routes = [];
    },
  };
}
