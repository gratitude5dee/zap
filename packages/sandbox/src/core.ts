import { definePlugin } from "@wzrdtech/zap-kernel";
import type { Disposer } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type {
  SandboxHandle,
  SandboxProvider,
  SandboxProviderId,
  SandboxService,
  SandboxSpec,
} from "./contract.ts";

export class SandboxCoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SandboxCoreError";
    this.code = code;
  }
}

export interface SandboxCoreConfig {
  /** the provider used when a spec names none registered; Box is the default (C2) */
  default?: SandboxProviderId;
}

/**
 * Provider registry behind the `sandbox` service. Adapters register
 * themselves; `acquire` dispatches on `spec.provider` and validates the
 * idempotency key (C26) before any provider call.
 */
export function createSandboxService(options?: SandboxCoreConfig): SandboxService {
  const providers = new Map<SandboxProviderId, SandboxProvider>();
  return {
    default: options?.default ?? "box",
    register(provider: SandboxProvider): Disposer {
      if (providers.has(provider.id)) {
        throw new SandboxCoreError("PROVIDER_DUPLICATE", `sandbox provider ${provider.id} is already registered`);
      }
      providers.set(provider.id, provider);
      return () => {
        providers.delete(provider.id);
      };
    },
    async acquire(spec: SandboxSpec): Promise<SandboxHandle> {
      if (!spec.idempotencyKey?.trim()) {
        throw new SandboxCoreError("IDEMPOTENCY_KEY_REQUIRED", "sandbox acquire requires spec.idempotencyKey");
      }
      const provider = providers.get(spec.provider);
      if (!provider) {
        throw new SandboxCoreError(
          "PROVIDER_UNREGISTERED",
          `sandbox provider ${spec.provider} is not registered; registered: ${[...providers.keys()].join(", ") || "none"}`,
        );
      }
      return provider.acquire(spec);
    },
    providers(): SandboxProviderId[] {
      return [...providers.keys()];
    },
  };
}

const schema = z.object({ default: z.string().optional() }).optional() as z.ZodType<SandboxCoreConfig | undefined>;

/** `sandbox.core` — provides the `sandbox` registry service. */
export const sandboxCore = definePlugin<SandboxCoreConfig | undefined>({
  name: "sandbox.core",
  schema,
  async apply(ctx, config) {
    const service = createSandboxService(config);
    await ctx.effect(() => ctx.provide("sandbox", service));
  },
});
