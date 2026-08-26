import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type {
  DoctorReport,
  ExecResult,
  SandboxCapabilities,
  SandboxFs,
  SandboxHandle,
  SandboxProvider,
  SandboxService,
  SandboxSpec,
} from "../../contract.ts";

export class SelfhostSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SelfhostSandboxError";
    this.code = code;
  }
}

export const SELFHOST_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: true,
  detached: false,
  snapshot: true,
  fork: false,
  stop: false,
  resume: false,
  ports: false,
  privatePorts: false,
  desktop: false,
  ssh: true,
  networkPolicy: "none",
  gpu: false,
  kvm: true,
  docker: false,
  isolation: "microvm",
  sizes: ["default"],
  maxCommandSeconds: 3600,
};

export interface SelfhostAdapterConfig {
  /** base URL of the zap-agentd instance, e.g. https://vps.example.com:8722 */
  baseUrl: string;
  /** ZAP_SELFHOST_TOKEN — the VPS-level bearer */
  token: string;
  fetchFn?: typeof fetch;
}

interface AgentdExecResponse {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

function makeAgentdCall(config: SelfhostAdapterConfig) {
  const fetchFn = config.fetchFn ?? fetch;
  return async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchFn(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new SelfhostSandboxError(`AGENTD_${response.status}`, `agentd ${path}: ${body.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  };
}

function toExecResult(response: AgentdExecResponse, startedAt: string): ExecResult {
  return {
    exitCode: response.exitCode,
    stdout: response.stdout,
    stderr: response.stderr,
    timedOut: response.timedOut ?? false,
    truncated: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    usage: { bytesIn: 0, bytesOut: response.stdout.length + response.stderr.length },
  };
}

export function createSelfhostHandle(config: SelfhostAdapterConfig, spec: SandboxSpec): SandboxHandle {
  const call = makeAgentdCall(config);
  let released = false;
  const assertLive = () => {
    if (released) throw new SelfhostSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
  };
  const fs: SandboxFs = {
    resolve: (p) => (p.startsWith("/") ? p : `/zap/fs/${p}`),
    async read(p) {
      assertLive();
      const result = await call<{ content: string | null }>(
        `/v1/files?path=${encodeURIComponent(fs.resolve(p))}`,
      );
      return result.content === null ? null : new TextEncoder().encode(result.content);
    },
    async write(p, bytes) {
      assertLive();
      await call("/v1/files", {
        method: "PUT",
        body: JSON.stringify({ path: fs.resolve(p), content: new TextDecoder().decode(bytes) }),
      });
    },
    async readdir(p) {
      assertLive();
      const result = await call<{ entries: Array<{ name: string; type: "file" | "dir" | "symlink"; size?: number }> }>(
        `/v1/files?path=${encodeURIComponent(fs.resolve(p))}&list=1`,
      );
      return result.entries;
    },
    async remove(p, opts) {
      assertLive();
      await call("/v1/files", {
        method: "DELETE",
        body: JSON.stringify({ path: fs.resolve(p), recursive: opts?.recursive, force: opts?.force }),
      });
    },
  };
  return {
    id: `selfhost:${new URL(config.baseUrl).host}`,
    provider: "selfhost",
    capabilities: SELFHOST_CAPABILITIES,
    fs,
    async state() {
      if (released) return "stopped";
      try {
        await call("/v1/health");
        return "ready";
      } catch {
        return "error";
      }
    },
    async exec(command, opts = {}) {
      assertLive();
      const startedAt = new Date().toISOString();
      if (opts.lane) {
        if (typeof command === "string") {
          throw new SelfhostSandboxError("LANE_REQUIRES_ARGV", "lane exec requires an argv array");
        }
        const response = await call<AgentdExecResponse>("/v1/lane", {
          method: "POST",
          body: JSON.stringify({ lane: opts.lane, argv: command, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs }),
        });
        return toExecResult(response, startedAt);
      }
      const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
      const response = await call<AgentdExecResponse>("/v1/exec", {
        method: "POST",
        body: JSON.stringify({ command: text, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs }),
      });
      return toExecResult(response, startedAt);
    },
    async snapshot(name) {
      assertLive();
      const result = await call<{ snapshotId: string }>("/v1/snapshot", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      return { provider: "selfhost", id: result.snapshotId, name, createdAt: new Date().toISOString() };
    },
    async release() {
      released = true;
    },
    async captureState() {
      return { provider: "selfhost", metadata: { baseUrl: config.baseUrl, purpose: spec.purpose } };
    },
  };
}

export function createSelfhostProvider(config: SelfhostAdapterConfig): SandboxProvider {
  if (!config.token?.trim()) {
    throw new SelfhostSandboxError("TOKEN_REQUIRED", "selfhost adapter requires ZAP_SELFHOST_TOKEN");
  }
  return {
    id: "selfhost",
    async capabilities() {
      return SELFHOST_CAPABILITIES;
    },
    async acquire(spec) {
      return createSelfhostHandle(config, spec);
    },
    async doctor(): Promise<DoctorReport> {
      const call = makeAgentdCall(config);
      let ok = false;
      let detail = `agentd at ${config.baseUrl}`;
      try {
        await call("/v1/health");
        ok = true;
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error);
      }
      return { provider: "selfhost", ok, checks: [{ id: "selfhost.agentd", ok, required: true, detail }] };
    },
  };
}

const schema = z.object({
  baseUrl: z.string(),
  token: z.string(),
}) as z.ZodType<SelfhostAdapterConfig>;

/** `sandbox.selfhost` — a KVM VPS running zap-agentd behind TLS. */
export const selfhostAdapter = definePlugin<SelfhostAdapterConfig>({
  name: "sandbox.selfhost",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createSelfhostProvider(config);
    await ctx.effect(() => sandbox.register(provider));
  },
});
