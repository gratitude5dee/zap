import type { SandboxBackend, SandboxBackendHandle } from "eve/sandbox";
import { defaultBackend } from "eve/sandbox";
import { docker } from "eve/sandbox/docker";
import { vercel } from "eve/sandbox/vercel";
import { daytonaBackend } from "./daytona";
import { e2bBackend } from "./e2b";
import { resolveManagedSandboxCredential } from "./managed-secrets";

export { resolveManagedSandboxCredential } from "./managed-secrets";

export const ZAP_SANDBOX_BACKENDS = ["vercel", "box", "daytona", "e2b", "docker", "auto"] as const;
export type ZapSandboxBackendName = (typeof ZAP_SANDBOX_BACKENDS)[number];

type Env = Readonly<Record<string, string | undefined>>;
type Factories<T> = Record<ZapSandboxBackendName, () => T>;

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
  const defaults = {
    auto: () => defaultBackend(),
    box: () => lazyBackend("ascii-box", async () => {
      const apiKey = env.BOX_API_KEY?.trim()
        || await resolveManagedSandboxCredential("box", "box_api_key", env);
      const { asciiBox } = await import("@asciidev/eve-box") as unknown as {
        asciiBox(options: { apiKey?: string; noEnv: boolean }): SandboxBackend;
      };
      return withBoxLifecycleCompatibility(asciiBox({ apiKey, noEnv: true }), apiKey);
    }),
    daytona: () => lazyBackend("daytona", () => daytonaBackend({ apiKey: env.DAYTONA_API_KEY })),
    docker: () => docker(),
    e2b: () => lazyBackend("e2b", () => e2bBackend({ apiKey: env.E2B_API_KEY })),
    vercel: () => vercel(),
  } as Factories<SandboxBackend>;
  return (factories ?? defaults as unknown as Factories<T>)[selected]();
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
