import type { SandboxBackend, SandboxBackendCreateInput, SandboxBackendHandle } from "eve/sandbox";
import { defaultBackend } from "eve/sandbox";
import { vercel } from "eve/sandbox/vercel";
import { createRuntime, type Plugin, type PluginEntry } from "@wzrdtech/zap-kernel";
import {
  boxAdapter,
  dockerAdapter,
  fakeAdapter,
  microsandboxAdapter,
  namespaceAdapter,
  sandboxCore,
  selfhostAdapter,
  type SandboxHandle,
  type SandboxProviderId,
  type SandboxService,
} from "@wzrdtech/zap-sandbox";
import { daytonaBackend } from "./daytona";
import { e2bBackend } from "./e2b";
import { resolveManagedSandboxCredential } from "./managed-secrets";
import { buildVendorSandboxSession, type SandboxDriver } from "./session";
import {
  resolveBoxSandboxOptions,
  resolveDaytonaSandboxOptions,
  resolveSandboxResources,
  resolveVercelSandboxOptions,
} from "./resources";

export { resolveManagedSandboxCredential } from "./managed-secrets";
export {
  resolveBoxSandboxOptions,
  resolveDaytonaSandboxOptions,
  resolveE2BSandboxOptions,
  resolveSandboxResources,
  resolveVercelSandboxOptions,
} from "./resources";

export const ZAP_SANDBOX_BACKENDS = [
  "vercel",
  "box",
  "box-legacy",
  "daytona",
  "e2b",
  "docker",
  "auto",
  "namespace",
  "selfhost",
  "microsandbox",
  "fake",
] as const;
export type ZapSandboxBackendName = (typeof ZAP_SANDBOX_BACKENDS)[number];

type Env = Readonly<Record<string, string | undefined>>;
type Factories<T> = Partial<Record<ZapSandboxBackendName, () => T>>;

export function resolveSandboxBackend(env?: Env): SandboxBackend;
export function resolveSandboxBackend<T extends { name: string }>(env: Env, factories: Factories<T>): T;
export function resolveSandboxBackend<T extends { name: string } = SandboxBackend>(
  env: Env = process.env,
  factories?: Factories<T>,
): T {
  const configured = env.ZAP_SANDBOX_BACKEND?.trim().toLowerCase();
  const selected = configured || "box";
  if (!isBackendName(selected)) {
    throw new Error(`ZAP_SANDBOX_BACKEND must be one of ${ZAP_SANDBOX_BACKENDS.join(", ")}; received ${selected}.`);
  }
  const resources = resolveSandboxResources(env);
  const defaults = {
    auto: () => defaultBackend(),
    box: () => bridgedBackend("box", env),
    "box-legacy": () => lazyBackend("ascii-box", async () => {
      const apiKey = env.BOX_API_KEY?.trim()
        || await resolveManagedSandboxCredential("box", "box_api_key", env);
      const { asciiBox } = await import("@asciidev/eve-box");
      const box = resolveBoxSandboxOptions(resources);
      return withBoxLifecycleCompatibility(asciiBox({
        apiKey,
        noEnv: true,
        ...box,
      }), apiKey);
    }),
    daytona: () => lazyBackend("daytona", () => {
      const daytona = resolveDaytonaSandboxOptions(resources);
      return daytonaBackend({
        apiKey: env.DAYTONA_API_KEY,
        resources: daytona.resources,
        timeoutSeconds: resources.timeoutSeconds,
      });
    }),
    docker: () => bridgedBackend("docker", env),
    e2b: () => lazyBackend("e2b", () => e2bBackend({
      apiKey: env.E2B_API_KEY,
      resources,
    })),
    fake: () => bridgedBackend("fake", env),
    microsandbox: () => bridgedBackend("microsandbox", env),
    namespace: () => bridgedBackend("namespace", env),
    selfhost: () => bridgedBackend("selfhost", env),
    vercel: () => vercel(resolveVercelSandboxOptions(resources)),
  } as Required<Factories<SandboxBackend>>;
  const factory = (factories ?? defaults as unknown as Factories<T>)[selected];
  if (!factory) {
    throw new Error(`ZAP_SANDBOX_BACKEND ${selected} has no registered factory.`);
  }
  return factory();
}

/** v5 bridge (goal §5.3.6): one lazy module-level runtime per provider id. */
const bridgeServices = new Map<SandboxProviderId, Promise<SandboxService>>();

async function bridgeAdapterEntry(providerId: SandboxProviderId, env: Env): Promise<Plugin<unknown> | PluginEntry<unknown>> {
  switch (providerId) {
    case "box": {
      const apiKey = env.BOX_API_KEY?.trim()
        || await resolveManagedSandboxCredential("box", "box_api_key", env);
      return boxAdapter({ apiKey, template: env.ZAP_BOX_TEMPLATE?.trim() || undefined }) as PluginEntry<unknown>;
    }
    case "docker":
      return dockerAdapter() as PluginEntry<unknown>;
    case "fake":
      return fakeAdapter({ env }) as PluginEntry<unknown>;
    case "namespace":
      return namespaceAdapter({
        region: env.NAMESPACE_REGION?.trim() || "us",
        token: env.NAMESPACE_TOKEN ?? "",
        imageRef: env.ZAP_NAMESPACE_IMAGE ?? "",
      }) as PluginEntry<unknown>;
    case "selfhost":
      return selfhostAdapter({
        baseUrl: env.ZAP_SELFHOST_URL ?? "",
        token: env.ZAP_SELFHOST_TOKEN ?? "",
      }) as PluginEntry<unknown>;
    case "microsandbox":
      return microsandboxAdapter({ apiKey: env.MSB_API_KEY }) as PluginEntry<unknown>;
    default:
      throw new Error(`Sandbox provider ${providerId} is not routed through the bridge.`);
  }
}

function bridgeService(providerId: SandboxProviderId, env: Env): Promise<SandboxService> {
  let service = bridgeServices.get(providerId);
  if (!service) {
    service = (async () => {
      const adapter = await bridgeAdapterEntry(providerId, env);
      const runtime = await createRuntime({ weight: "light", plugins: [sandboxCore(), adapter] });
      await runtime.ctx.ready();
      const sandbox = runtime.ctx.get<SandboxService>("sandbox");
      if (!sandbox) throw new Error("The sandbox service failed to mount for the Eve bridge.");
      return sandbox;
    })();
    bridgeServices.set(providerId, service);
  }
  return service;
}

/** exposed for tests: reset the module-level bridge runtimes */
export function resetSandboxBridge(): void {
  bridgeServices.clear();
}

export function driverFromHandle(handle: SandboxHandle): SandboxDriver {
  return {
    id: handle.id,
    async read(path) {
      return handle.fs.read(path);
    },
    async remove(path, recursive, force) {
      await handle.fs.remove(path, { force, recursive });
    },
    async run(input) {
      const result = await handle.exec(input.command, {
        cwd: input.workingDirectory,
        env: input.env,
        signal: input.abortSignal,
      });
      return { exitCode: result.exitCode, stderr: result.stderr, stdout: result.stdout };
    },
    shutdown: () => handle.release(),
    async write(path, content) {
      await handle.fs.write(path, content);
    },
  };
}

export function eveBackendFromProvider(
  sandbox: SandboxService | Promise<SandboxService>,
  providerId: SandboxProviderId,
): SandboxBackend {
  const prepared = new Map<string, true>();
  return {
    name: providerId,
    async prewarm(input) {
      const reused = prepared.has(input.templateKey);
      prepared.set(input.templateKey, true);
      return { reused };
    },
    async create(input: SandboxBackendCreateInput) {
      const service = await sandbox;
      const existingId = typeof input.existingMetadata?.sandboxId === "string" ? input.existingMetadata.sandboxId : undefined;
      const handle = await service.acquire({
        provider: providerId,
        purpose: "runtime",
        idempotencyKey: input.sessionKey,
        template: input.templateKey ?? undefined,
        ...(existingId ? { existing: { id: existingId, metadata: input.existingMetadata } } : {}),
      });
      const session = buildVendorSandboxSession(driverFromHandle(handle));
      return {
        async captureState() {
          const state = await handle.captureState();
          return { backendName: providerId, metadata: { sandboxId: handle.id, ...state.metadata }, sessionKey: input.sessionKey };
        },
        session,
        shutdown: () => handle.release(),
        useSessionFn: async () => session,
      } satisfies SandboxBackendHandle;
    },
  };
}

function bridgedBackend(providerId: SandboxProviderId, env: Env): SandboxBackend {
  return eveBackendFromProvider(bridgeService(providerId, env), providerId);
}

export function withBoxLifecycleCompatibility(backend: SandboxBackend, apiKey: string): SandboxBackend {
  return {
    name: backend.name,
    prewarm: (input) => backend.prewarm(input),
    async create(input) {
      const handle = await backend.create(input) as unknown as LegacyBoxHandle;
      return {
        session: handle.session,
        useSessionFn: handle.useSessionFn,
        captureState: () => handle.captureState(),
        async shutdown() {
          if (typeof handle.shutdown === "function") {
            await handle.shutdown();
            return;
          }
          const state = await handle.captureState();
          await handle.dispose?.();
          const boxId = typeof state.metadata.boxId === "string" ? state.metadata.boxId : undefined;
          if (!boxId) throw new Error("Legacy ascii Box handle did not expose metadata.boxId for shutdown.");
          const response = await fetch(`https://ascii.dev/api/box/v1/boxes/${encodeURIComponent(boxId)}/stop`, {
            headers: { authorization: `Bearer ${apiKey}` },
            method: "POST",
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({})) as { message?: unknown };
            const message = typeof payload.message === "string" ? payload.message : `Box shutdown failed with ${response.status}.`;
            throw new Error(message);
          }
        },
      } satisfies SandboxBackendHandle;
    },
  };
}

type LegacyBoxHandle = Omit<SandboxBackendHandle, "shutdown"> & {
  dispose?: () => Promise<void>;
  shutdown?: () => Promise<void>;
};

function isBackendName(value: string): value is ZapSandboxBackendName {
  return (ZAP_SANDBOX_BACKENDS as readonly string[]).includes(value);
}

function lazyBackend(name: string, load: () => Promise<SandboxBackend>): SandboxBackend {
  let backend: Promise<SandboxBackend> | undefined;
  const get = () => backend ??= load();
  return {
    name,
    async create(input) { return (await get()).create(input); },
    async prewarm(input) { return (await get()).prewarm(input); },
  };
}
