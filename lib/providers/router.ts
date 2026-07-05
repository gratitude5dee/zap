import { createHash } from "node:crypto";
import { enqueueProviderPoll, getIdempotencyKey, setIdempotencyKey } from "../redis";
import type { GenRequest, ProviderId, ProviderPollResult, ProviderSecrets } from "../provider-types";
import { listModelRates } from "../pricing";
import { buildProviderWebhookUrl } from "../provider-webhooks";
import { ZapRunError } from "../zap-errors";
import { zapStepKindSchema } from "../zap-schema";
import { defaultModelFor, getProviderAdapter, listProviderAdapters, ProviderError } from "@wzrdtech/providers";

const adapters = listProviderAdapters();

export async function submitGeneration(req: GenRequest) {
  const adapter = selectAdapter(req);
  const model = req.model || adapter.defaultModel(req.capability);
  const idemKey = buildIdempotencyKey(req);
  const existing = await getIdempotencyKey(idemKey);
  if (existing) {
    return { idemKey, provider: adapter.id, requestId: existing, replayed: true };
  }

  const submitted = await adapter.submit({
    ...req,
    model,
    provider: adapter.id,
    webhookUrl: req.webhookUrl ?? buildProviderWebhookUrl(adapter.id, {
      capability: req.capability,
      runId: req.runId,
      stepId: req.stepId,
    }),
  }, idemKey);
  await setIdempotencyKey(idemKey, submitted.requestId);
  await enqueueProviderPoll(adapter.id, submitted.requestId, { capability: req.capability, runId: req.runId, stepId: req.stepId });
  return { idemKey, provider: adapter.id, requestId: submitted.requestId };
}

export async function pollGeneration(provider: string, requestId: string, secrets?: ProviderSecrets): Promise<ProviderPollResult> {
  const adapter = selectProviderById(provider);
  return adapter.poll(requestId, secrets);
}

export function quoteGeneration(req: GenRequest) {
  const adapter = selectAdapter(req);
  try {
    return adapter.price({ ...req, model: req.model || adapter.defaultModel(req.capability) });
  } catch (error) {
    if (error instanceof ProviderError && error.code === "PRICE_UNKNOWN") {
      throw new ZapRunError({
        alternatives: listModelRates().slice(0, 5).map((rate) => rate.model),
        code: "UNKNOWN_MODEL",
        message: error.message,
        remediation: "Add pricing for this model before submitting paid work, or choose a model with known pricing.",
        retryable: false,
      });
    }
    throw error;
  }
}

export function listCapabilityManifest({ includeMock = false } = {}) {
  void includeMock;
  const providers = adapters;
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

function selectAdapter(req: GenRequest) {
  const adapter = selectProviderById(req.provider);
  const model = req.model || adapter.defaultModel(req.capability);
  if (!adapter.supports(req.capability, model)) {
    throw new ZapRunError({
      alternatives: adapters
        .filter((candidate) => candidate.supports(req.capability, model))
        .map((candidate) => candidate.id),
      code: "PROVIDER_UNSUPPORTED",
      message: `Provider ${adapter.id} does not support ${req.capability} / ${model}.`,
      remediation: "Choose a supported model/provider pair, or set retry.fallback_provider for explicit failover.",
      retryable: false,
    });
  }
  return adapter;
}

function selectProviderById(provider: string) {
  if (provider === "mock") {
    throw new ZapRunError({
      code: "PROVIDER_UNSUPPORTED",
      message: "provider: mock is not supported in Zap v0.2.0.",
      remediation: "Use dry-run planning for zero-spend validation, or choose gmi, fal, prodia, or runware for live work.",
      retryable: false,
    });
  }
  if (provider !== "gmi" && provider !== "fal" && provider !== "prodia" && provider !== "runware") {
    throw new ZapRunError({
      alternatives: ["gmi", "fal", "prodia", "runware"],
      code: "PROVIDER_UNSUPPORTED",
      message: `Unknown provider ${provider}.`,
      remediation: "Choose a supported provider id.",
      retryable: false,
    });
  }
  return getProviderAdapter(provider as ProviderId);
}

export function buildIdempotencyKey(req: GenRequest) {
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

export function defaultProviderModel(provider: ProviderId, capability: GenRequest["capability"]) {
  return defaultModelFor(provider, capability);
}
