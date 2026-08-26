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

export class NamespaceSandboxError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NamespaceSandboxError";
    this.code = code;
  }
}

export const NAMESPACE_CAPABILITIES: SandboxCapabilities = {
  exec: true,
  files: true,
  readdir: true,
  detached: false,
  snapshot: false,
  fork: false,
  stop: true,
  resume: true,
  ports: true,
  privatePorts: false,
  desktop: false,
  ssh: true,
  networkPolicy: "none",
  gpu: false,
  kvm: true,
  docker: true,
  isolation: "vm",
  sizes: ["2x4", "4x8", "8x16"],
  maxCommandSeconds: 3600,
};

/** Zap size names → Namespace shapes. */
export const NAMESPACE_SIZE_MAP: Record<string, string> = {
  small: "2x4",
  default: "4x8",
  large: "8x16",
};

export const NAMESPACE_IAM_API = "https://iam.namespaceapis.com";
export const NAMESPACE_INGRESS_TOKEN_TTL_MS = 5 * 60 * 1000;

/** Required per-instance env (mirrors the Box per-box env contract). */
const requiredInstanceEnv = ["TENANT_ID", "RUNTIME_ID", "RUNTIME_TOKEN"] as const;

export interface NamespaceAdapterConfig {
  region: string;
  /** bearer for the compute API */
  token: string;
  /** zap-heavy image ref built from the shared bake.sh (TARGET=namespace) */
  imageRef: string;
  fetchFn?: typeof fetch;
  /**
   * RPCs not yet confirmed by verify item 5 stay behind this flag and are
   * reported by doctor as unverified.
   */
  allowUnverifiedRpcs?: boolean;
}

interface NamespaceInstance {
  instanceId: string;
  status: string;
  ingressUrl?: string;
}

export function computeEndpoint(region: string, rpc: string): string {
  return `https://${region}.compute.namespaceapis.com/namespace.cloud.compute.v1beta.ComputeService/${rpc}`;
}

export function commandEndpoint(region: string): string {
  return `https://${region}.compute.namespaceapis.com/namespace.cloud.compute.v1beta.CommandService/RunCommandSync`;
}

export function createNamespaceRpcClient(config: NamespaceAdapterConfig) {
  const fetchFn = config.fetchFn ?? fetch;
  let cachedIngressToken: { token: string; expiresAt: number } | undefined;
  async function rpc<T>(url: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new NamespaceSandboxError(`RPC_${response.status}`, `${url}: ${text.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }
  return {
    rpc,
    async ingressAccessToken(): Promise<string> {
      if (cachedIngressToken && cachedIngressToken.expiresAt > Date.now()) {
        return cachedIngressToken.token;
      }
      const result = await rpc<{ token: string }>(
        `${NAMESPACE_IAM_API}/nsl.tenants.TenantsService/IssueIngressAccessToken`,
        {},
      );
      cachedIngressToken = { token: result.token, expiresAt: Date.now() + NAMESPACE_INGRESS_TOKEN_TTL_MS };
      return result.token;
    },
  };
}

function bridgeFs(
  callBridge: <T>(path: string, init?: RequestInit) => Promise<T>,
  assertLive: () => void,
): SandboxFs {
  const resolvePath = (p: string) => (p.startsWith("/") ? p : `/zap/fs/${p}`);
  return {
    resolve: resolvePath,
    async read(p) {
      assertLive();
      const result = await callBridge<{ content: string | null }>(`/v1/files?path=${encodeURIComponent(resolvePath(p))}`);
      return result.content === null ? null : new TextEncoder().encode(result.content);
    },
    async write(p, bytes) {
      assertLive();
      await callBridge("/v1/files", {
        method: "PUT",
        body: JSON.stringify({ path: resolvePath(p), content: new TextDecoder().decode(bytes) }),
      });
    },
    async readdir(p) {
      assertLive();
      const result = await callBridge<{ entries: Array<{ name: string; type: "file" | "dir" | "symlink"; size?: number }> }>(
        `/v1/files?path=${encodeURIComponent(resolvePath(p))}&list=1`,
      );
      return result.entries;
    },
    async remove(p, opts) {
      assertLive();
      await callBridge("/v1/files", {
        method: "DELETE",
        body: JSON.stringify({ path: resolvePath(p), recursive: opts?.recursive, force: opts?.force }),
      });
    },
  };
}

export function createNamespaceProvider(config: NamespaceAdapterConfig): SandboxProvider {
  const client = createNamespaceRpcClient(config);
  return {
    id: "namespace",
    async capabilities() {
      return NAMESPACE_CAPABILITIES;
    },
    async acquire(spec: SandboxSpec): Promise<SandboxHandle> {
      const env = spec.env ?? {};
      for (const key of requiredInstanceEnv) {
        if (!env[key]?.trim()) {
          throw new NamespaceSandboxError("ENV_MISSING", `namespace: per-instance env is missing ${key}`);
        }
      }
      const shape = NAMESPACE_SIZE_MAP[spec.size ?? "default"] ?? spec.size ?? "4x8";
      const created = spec.existing
        ? { instanceId: spec.existing.id, status: "RUNNING" }
        : await client.rpc<NamespaceInstance>(computeEndpoint(config.region, "CreateInstance"), {
            shape,
            containers: [{ imageRef: config.imageRef, exportPorts: [{ port: 8722 }], env }],
          });
      await client.rpc(computeEndpoint(config.region, "WaitInstanceSync"), { instanceId: created.instanceId });
      const ingress = await client.rpc<{ url: string }>(computeEndpoint(config.region, "CreateIngress"), {
        instanceId: created.instanceId,
        port: 8722,
      });
      let released = false;
      const assertLive = () => {
        if (released) throw new NamespaceSandboxError("SANDBOX_RELEASED", "sandbox handle was released");
      };
      const callBridge = async <T,>(path: string, init?: RequestInit): Promise<T> => {
        const ingressToken = await client.ingressAccessToken();
        const fetchFn = config.fetchFn ?? fetch;
        const response = await fetchFn(`${ingress.url}${path}`, {
          ...init,
          headers: {
            "x-nsc-ingress-auth": ingressToken,
            "X-Zap-Bridge-Token": env.RUNTIME_TOKEN,
            "Content-Type": "application/json",
            ...init?.headers,
          },
        });
        if (!response.ok) {
          const text = await response.text();
          throw new NamespaceSandboxError(`BRIDGE_${response.status}`, `${path}: ${text.slice(0, 300)}`);
        }
        return (await response.json()) as T;
      };
      const handle: SandboxHandle = {
        id: created.instanceId,
        provider: "namespace",
        capabilities: NAMESPACE_CAPABILITIES,
        fs: bridgeFs(callBridge, assertLive),
        async state() {
          if (released) return "stopped";
          const described = await client.rpc<NamespaceInstance>(
            computeEndpoint(config.region, "DescribeInstance"),
            { instanceId: created.instanceId },
          );
          if (described.status === "RUNNING") return "ready";
          if (described.status === "SUSPENDED") return "stopped";
          return "provisioning";
        },
        async exec(command, opts = {}): Promise<ExecResult> {
          assertLive();
          const startedAt = new Date().toISOString();
          if (opts.lane) {
            if (typeof command === "string") {
              throw new NamespaceSandboxError("LANE_REQUIRES_ARGV", "lane exec requires an argv array");
            }
            const result = await callBridge<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }>(
              "/v1/lane",
              {
                method: "POST",
                body: JSON.stringify({ lane: opts.lane, argv: command, cwd: opts.cwd, env: opts.env, timeoutMs: opts.timeoutMs }),
              },
            );
            return {
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
              timedOut: result.timedOut ?? false,
              truncated: false,
              startedAt,
              finishedAt: new Date().toISOString(),
              usage: { bytesIn: 0, bytesOut: result.stdout.length + result.stderr.length },
            };
          }
          const text = typeof command === "string" ? command : command.map((part) => JSON.stringify(part)).join(" ");
          const result = await client.rpc<{ exitCode: number; stdout: string; stderr: string }>(
            commandEndpoint(config.region),
            { instanceId: created.instanceId, command: text, cwd: opts.cwd, env: opts.env },
          );
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
        async stop() {
          if (released) return;
          await client.rpc(computeEndpoint(config.region, "SuspendInstance"), { instanceId: created.instanceId });
        },
        async resume() {
          assertLive();
          await client.rpc(computeEndpoint(config.region, "WakeInstance"), { instanceId: created.instanceId });
          await client.rpc(computeEndpoint(config.region, "WaitInstanceSync"), { instanceId: created.instanceId });
        },
        async remove() {
          await client.rpc(computeEndpoint(config.region, "DestroyInstance"), { instanceId: created.instanceId });
        },
        async release() {
          if (released) return;
          released = true;
          if (spec.purpose === "run" || spec.purpose === "lane") return;
          await client
            .rpc(computeEndpoint(config.region, "SuspendInstance"), { instanceId: created.instanceId })
            .catch(() => undefined);
          if (spec.purpose === "test") {
            await client
              .rpc(computeEndpoint(config.region, "DestroyInstance"), { instanceId: created.instanceId })
              .catch(() => undefined);
          }
        },
        async captureState() {
          return { provider: "namespace", metadata: { instanceId: created.instanceId, region: config.region } };
        },
      };
      return handle;
    },
    async doctor(): Promise<DoctorReport> {
      const hasToken = Boolean(config.token?.trim());
      return {
        provider: "namespace",
        ok: hasToken,
        checks: [
          { id: "namespace.token", ok: hasToken, required: true, detail: hasToken ? "compute token configured" : "missing token" },
          {
            id: "namespace.rpcs",
            ok: Boolean(config.allowUnverifiedRpcs),
            required: false,
            detail: config.allowUnverifiedRpcs ? "unverified RPCs enabled" : "unverified (verify item 5 pending)",
          },
        ],
      };
    },
  };
}

const schema = z.object({
  region: z.string(),
  token: z.string(),
  imageRef: z.string(),
  allowUnverifiedRpcs: z.boolean().optional(),
}) as z.ZodType<NamespaceAdapterConfig>;

/** `sandbox.namespace` — Namespace compute instances (Linux and macOS). */
export const namespaceAdapter = definePlugin<NamespaceAdapterConfig>({
  name: "sandbox.namespace",
  inject: ["sandbox"],
  schema,
  async apply(ctx, config) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    const provider = createNamespaceProvider(config);
    await ctx.effect(() => sandbox.register(provider));
  },
});
