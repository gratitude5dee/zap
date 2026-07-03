import { createHash } from "node:crypto";
import { enqueueProviderPoll, getIdempotencyKey, setIdempotencyKey } from "../redis";
import type { GenRequest, ProviderAdapter, ProviderPollResult } from "../provider-types";
import { falAdapter } from "./fal";
import { gmiAdapter } from "./gmi";
import { mockAdapter } from "./mock";

const adapters: ProviderAdapter[] = [mockAdapter, gmiAdapter, falAdapter];

export async function submitGeneration(req: GenRequest) {
  const adapter = selectAdapter(req);
  const idemKey = buildIdempotencyKey(req);
  const existing = await getIdempotencyKey(idemKey);
  if (existing) {
    return { idemKey, provider: adapter.id, requestId: existing, replayed: true };
  }

  const submitted = await adapter.submit(req, idemKey);
  await setIdempotencyKey(idemKey, submitted.requestId);
  await enqueueProviderPoll(adapter.id, submitted.requestId, { capability: req.capability, runId: req.runId, stepId: req.stepId });
  return { idemKey, provider: adapter.id, requestId: submitted.requestId };
}

export async function pollGeneration(provider: string, requestId: string): Promise<ProviderPollResult> {
  const adapter = adapters.find((candidate) => candidate.id === provider);
  if (!adapter) throw new Error(`Unknown provider ${provider}.`);
  return adapter.poll(requestId);
}

export function quoteGeneration(req: GenRequest) {
  return selectAdapter(req).price(req);
}

function selectAdapter(req: GenRequest) {
  const provider = req.provider ?? process.env.ZAP_PROVIDER;
  const preferred = provider ? adapters.find((adapter) => adapter.id === provider) : undefined;
  if (preferred?.supports(req.capability, req.model)) return preferred;
  const fallback = adapters.find((adapter) => adapter.supports(req.capability, req.model));
  if (!fallback) throw new Error(`No provider supports ${req.capability} / ${req.model}.`);
  return fallback;
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
