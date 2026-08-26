import { createHash } from "node:crypto";
import { zapStepKindSchema } from "@wzrdtech/core";
import {
  ProviderError,
  getProviderAdapter,
  listModelRates,
  providerAdapters,
  type Capability,
  type GenRequest,
  type ProviderAdapter,
} from "@wzrdtech/providers";
import { replicateAdapter } from "@wzrdtech/providers/replicate";

/** Structured router failure; codes mirror the 0.3.1 run errors. */
export class RouterError extends Error {
  readonly code: "PROVIDER_UNSUPPORTED" | "UNKNOWN_MODEL" | "PRICE_UNKNOWN";
  readonly remediation?: string;
  readonly alternatives?: string[];
  readonly retryable: boolean;

  constructor(options: {
    code: RouterError["code"];
    message: string;
    remediation?: string;
    alternatives?: string[];
    retryable?: boolean;
  }) {
    super(options.message);
    this.name = "RouterError";
    this.code = options.code;
    this.remediation = options.remediation;
    this.alternatives = options.alternatives;
    this.retryable = options.retryable ?? false;
  }
}

export type MediaGenRequest = Omit<GenRequest, "provider"> & { provider: string };

const routedAdapters: Record<string, ProviderAdapter> = {
  ...providerAdapters,
  replicate: replicateAdapter as unknown as ProviderAdapter,
};

export function listRoutedAdapters(): ProviderAdapter[] {
  return Object.values(routedAdapters);
}

export function selectProviderById(provider: string): ProviderAdapter {
  if (provider === "mock") {
    throw new RouterError({
      code: "PROVIDER_UNSUPPORTED",
      message: "provider: mock is not supported.",
      remediation: `Use dry-run planning for zero-spend validation, or choose ${Object.keys(routedAdapters).join(", ")} for live work.`,
    });
  }
  const adapter = routedAdapters[provider] ?? getProviderAdapter(provider);
  if (!adapter) {
    throw new RouterError({
      alternatives: Object.keys(routedAdapters),
      code: "PROVIDER_UNSUPPORTED",
      message: `Unknown provider ${provider}.`,
      remediation: "Choose a supported provider id.",
    });
  }
  return adapter;
}

export function selectAdapter(req: MediaGenRequest): ProviderAdapter {
  const adapter = selectProviderById(req.provider);
  const model = req.model || adapter.defaultModel(req.capability);
  if (!adapter.supports(req.capability, model)) {
    throw new RouterError({
      alternatives: listRoutedAdapters()
        .filter((candidate) => candidate.supports(req.capability, model))
        .map((candidate) => candidate.id),
      code: "PROVIDER_UNSUPPORTED",
      message: `Provider ${adapter.id} does not support ${req.capability} / ${model}.`,
      remediation: "Choose a supported model/provider pair, or set retry.fallback_provider for explicit failover.",
    });
  }
  return adapter;
}

/** 0.3.1-compatible quote: unknown pricing surfaces as UNKNOWN_MODEL. */
export function quoteGeneration(req: MediaGenRequest): number {
  const adapter = selectAdapter(req);
  try {
    return adapter.price({ ...(req as GenRequest), model: req.model || adapter.defaultModel(req.capability) });
  } catch (error) {
    if (error instanceof ProviderError && error.code === "PRICE_UNKNOWN") {
      throw new RouterError({
        alternatives: listModelRates().slice(0, 5).map((rate) => rate.model),
        code: "UNKNOWN_MODEL",
        message: error.message,
        remediation: "Add pricing for this model before submitting paid work, or choose a model with known pricing.",
      });
    }
    throw error;
  }
}

/**
 * Mode-aware quote: live mode throws PRICE_UNKNOWN for unpriced models;
 * plan-only mode returns usd 0 with a warning (C25 — plan never blocks on price).
 */
export function quoteGenerationForMode(
  req: MediaGenRequest,
  opts: { live: boolean },
): { usd: number; warning?: string } {
  const adapter = selectAdapter(req);
  const model = req.model || adapter.defaultModel(req.capability);
  try {
    return { usd: adapter.price({ ...(req as GenRequest), model }) };
  } catch (error) {
    if (error instanceof ProviderError && error.code === "PRICE_UNKNOWN") {
      if (opts.live) {
        throw new RouterError({ code: "PRICE_UNKNOWN", message: error.message });
      }
      return { usd: 0, warning: `No pricing is configured for model ${model}; planned at $0.` };
    }
    throw error;
  }
}

export function listCapabilityManifest() {
  const providers = listRoutedAdapters();
  const pricedModels = listModelRates();
  const generated = providers.flatMap((adapter) =>
    pricedModels.flatMap((rate) =>
      zapStepKindSchema.options
        .filter((capability) => adapter.supports(capability, rate.model))
        .map((capability) => ({
          capability,
          model: rate.model,
          price: rate.perSecond !== undefined
            ? { unit: "second" as const, usd: rate.perSecond }
            : { unit: "request" as const, usd: rate.perRequest ?? 0 },
          provider: adapter.id,
        })),
    ),
  );

  return [
    ...generated,
    { capability: "stitch" as const, model: "ffmpeg", price: { unit: "local" as const, usd: 0 }, provider: "local" },
    { capability: "keyframes" as const, model: "ffmpeg", price: { unit: "local" as const, usd: 0 }, provider: "local" },
  ];
}

export function buildIdempotencyKey(req: {
  attemptSalt?: string;
  capability: Capability;
  durationS?: number;
  inputs: Record<string, unknown>;
  model: string;
  prompt: string;
  provider: string;
  runId: string;
  stepId: string;
}): string {
  const salt = req.attemptSalt ?? createHash("sha256")
    .update(JSON.stringify({
      capability: req.capability,
      durationS: req.durationS,
      inputs: req.inputs,
      model: req.model,
      prompt: req.prompt,
      provider: req.provider,
    }))
    .digest("hex")
    .slice(0, 16);
  return `zap:idem:${req.runId}:${req.stepId}:${salt}`;
}
