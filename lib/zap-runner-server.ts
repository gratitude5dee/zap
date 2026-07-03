import { nanoid } from "nanoid";
import { persistDataUrlAsset, persistRemoteAsset } from "./blob-store";
import { renderHyperframesStitch } from "./hyperframes-stitch";
import { loadZapSpec, readPrompt } from "./zap-files";
import { pollGeneration, quoteGeneration, submitGeneration } from "./providers/router";
import { revealZapSecretsForProvider } from "./supabase/server";
import type { GenRequest } from "./provider-types";
import type { ZapSpec, ZapStep } from "./zap-schema";

export type RunZapInput = {
  extendCount: number;
  inputs: Record<string, unknown>;
  live?: boolean;
  provider?: string;
  slug: string;
  userAccessToken?: string;
};

export type RunZapSubmittedStep = {
  actualUsd?: number;
  assetUrl?: string;
  error?: string;
  idemKey?: string;
  kind: ZapStep["kind"];
  model?: string;
  provider?: string;
  providerRequestId?: string;
  quoteUsd: number;
  status: "done" | "queued" | "running" | "skipped";
  stepId: string;
};

type LocalStepResult = {
  assetUrl?: string;
  error?: string;
};

export async function runZapRecipe({ extendCount, inputs, live = false, provider, slug, userAccessToken }: RunZapInput) {
  const zap = await loadZapSpec(slug);
  if (!zap) throw new Error(`Unknown Zap ${slug}.`);
  validateInputs(zap, inputs);

  const runId = `run_${nanoid(12)}`;
  const planned = planSteps(zap, extendCount);
  const quoteUsd = planned.reduce((sum, step) => sum + quoteForStep(zap, runId, step, inputs), 0);
  if (quoteUsd > zap.budget.cap_usd) {
    throw new Error(`Run quote $${quoteUsd.toFixed(2)} exceeds recipe cap $${zap.budget.cap_usd}.`);
  }

  const normalizedInputs = await normalizeInputAssets(runId, inputs);
  const assetUrls = new Map<string, string>();
  const submittedSteps: RunZapSubmittedStep[] = [];
  let zapUrl: string | undefined;

  for (const step of planned) {
    const stepQuoteUsd = quoteForStep(zap, runId, step, inputs);
    if (isLocalStep(step)) {
      const stitched = await runLocalStep(runId, step, assetUrls);
      if (stitched.assetUrl) zapUrl = stitched.assetUrl;
      submittedSteps.push({
        assetUrl: stitched.assetUrl,
        error: stitched.error,
        kind: step.kind,
        model: step.model,
        quoteUsd: stepQuoteUsd,
        status: stitched.assetUrl ? "done" : "skipped",
        stepId: step.id,
      });
      continue;
    }

    const request = await buildGenerationRequest(zap, runId, step, normalizedInputs, assetUrls, {
      provider: live ? provider : "mock",
      userAccessToken: live ? userAccessToken : undefined,
    });
    const submitted = await submitGeneration(request);
    const submittedStep: RunZapSubmittedStep = {
      idemKey: submitted.idemKey,
      kind: step.kind,
      model: step.model,
      provider: submitted.provider,
      providerRequestId: submitted.requestId,
      quoteUsd: stepQuoteUsd,
      status: "running",
      stepId: step.id,
    };
    submittedSteps.push(submittedStep);

    const result = await pollGenerationUntilDone(submitted.provider, submitted.requestId, request.secrets);
    if (!result.outputUrl) {
      throw new Error(`Provider ${submitted.provider} completed ${step.id} without an output URL.`);
    }
    const stored = submitted.provider === "mock" ? { url: result.outputUrl } : await persistStepOutput(runId, step, result.outputUrl);
    submittedStep.actualUsd = result.actualUsd;
    submittedStep.assetUrl = stored?.url ?? result.outputUrl;
    submittedStep.status = "done";
    assetUrls.set(step.id, submittedStep.assetUrl);
    if (step.kind.startsWith("video.")) zapUrl = submittedStep.assetUrl;
  }

  return {
    message: zapUrl ? `Completed ${zap.zap} with ${submittedSteps.length} planned steps.` : `Submitted ${zap.zap} with ${submittedSteps.length} planned steps.`,
    quoteUsd,
    runId,
    status: zapUrl ? "done" : "running",
    steps: submittedSteps,
    zapUrl,
  };
}

export async function buildGenerationRequest(
  zap: ZapSpec,
  runId: string,
  step: ZapStep,
  inputs: Record<string, unknown>,
  assetUrls = new Map<string, string>(),
  options: { provider?: string; userAccessToken?: string } = {},
): Promise<GenRequest> {
  const prompt = interpolate(await readPrompt(zap.zap, step.prompt), inputs);
  const imageUrls = resolveImageUrls(step, inputs, assetUrls);
  const provider = options.provider ?? step.provider ?? zap.defaults.provider;
  return {
    capability: step.kind,
    durationS: step.duration_s,
    inputs: {
      ...inputs,
      imageUrl: imageUrls.at(0),
      imageUrls,
      referenceImages: imageUrls,
    },
    model: step.model ?? "local",
    prompt,
    provider,
    runId,
    secrets: await revealZapSecretsForProvider(provider, options.userAccessToken),
    stepId: step.id,
  };
}

export async function persistStepOutput(runId: string, step: ZapStep, outputUrl?: string) {
  if (!outputUrl) return null;
  return persistRemoteAsset(outputUrl, `runs/${runId}/${step.id}/${Date.now()}`);
}

function validateInputs(zap: ZapSpec, inputs: Record<string, unknown>) {
  for (const [name, spec] of Object.entries(zap.inputs)) {
    if (spec.required && inputs[name] === undefined) {
      throw new Error(`Missing required input ${name}.`);
    }
  }
}

async function normalizeInputAssets(runId: string, inputs: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(inputs)) {
    normalized[name] = typeof value === "string" && value.startsWith("data:")
      ? (await persistDataUrlAsset(value, `runs/${runId}/inputs/${name}`)).url
      : value;
  }
  return normalized;
}

function planSteps(zap: ZapSpec, extendCount: number) {
  return zap.steps.flatMap((step) => {
    if (step.kind !== "video.extend") return [step];
    const max = step.repeat?.max ?? 64;
    const count = Math.min(extendCount, max);
    return Array.from({ length: count }, (_, index) => ({ ...step, id: `${step.id}_${index + 1}` }));
  });
}

function quoteForStep(zap: ZapSpec, runId: string, step: ZapStep, inputs: Record<string, unknown>) {
  if (isLocalStep(step)) return 0;
  return quoteGeneration({
    capability: step.kind,
    durationS: step.duration_s,
    inputs,
    model: step.model ?? "local",
    prompt: "",
    provider: step.provider ?? zap.defaults.provider,
    runId,
    stepId: step.id,
  });
}

function isLocalStep(step: ZapStep) {
  return step.kind === "stitch" || step.kind === "keyframes";
}

async function runLocalStep(runId: string, step: ZapStep, assetUrls: Map<string, string>): Promise<LocalStepResult> {
  if (step.kind !== "stitch") return {};

  const resolvedAssets = resolveAssetRefs(step.inputs ?? [], assetUrls);
  if (step.stitch?.engine === "hyperframes") {
    return renderHyperframesStitch({
      assetUrls: resolvedAssets,
      runId,
      step,
    });
  }

  return { assetUrl: resolvedAssets.at(0) };
}

function resolveImageUrls(step: ZapStep, inputs: Record<string, unknown>, assetUrls: Map<string, string>) {
  const urls: string[] = [];
  for (const ref of [...(step.inputs ?? []), ...(step.reference_images ?? [])]) {
    const url = resolveRef(ref, inputs, assetUrls);
    if (url) urls.push(url);
  }
  const userImage = typeof inputs.image === "string" ? inputs.image : undefined;
  if (urls.length === 0 && userImage) urls.push(userImage);
  return urls;
}

function resolveAssetRefs(refs: string[], assetUrls: Map<string, string>) {
  return refs.flatMap((ref) => {
    if (ref.endsWith(".*")) {
      const prefix = ref.slice(0, -2);
      return Array.from(assetUrls.entries())
        .filter(([stepId]) => stepId === prefix || stepId.startsWith(`${prefix}_`))
        .map(([, url]) => url);
    }
    const url = assetUrls.get(ref);
    return url ? [url] : [];
  });
}

function resolveRef(ref: string, inputs: Record<string, unknown>, assetUrls: Map<string, string>) {
  if (ref.startsWith("user.")) {
    const value = inputs[ref.slice("user.".length)];
    return typeof value === "string" ? value : undefined;
  }
  const assetUrl = assetUrls.get(ref);
  if (assetUrl) return assetUrl;
  const inputValue = inputs[ref];
  return typeof inputValue === "string" ? inputValue : undefined;
}

async function pollGenerationUntilDone(provider: string, requestId: string, secrets?: Record<string, string>) {
  const deadline = Date.now() + Number(process.env.ZAP_SYNC_POLL_TIMEOUT_MS ?? 1000 * 60 * 20);
  const delayMs = Number(process.env.ZAP_SYNC_POLL_INTERVAL_MS ?? 5000);
  while (Date.now() < deadline) {
    const result = await pollGeneration(provider, requestId, secrets);
    if (result.status === "done") return result;
    if (result.status === "failed") {
      throw new Error(result.error ?? `${provider} generation ${requestId} failed.`);
    }
    await sleep(delayMs);
  }
  throw new Error(`${provider} generation ${requestId} did not finish before the sync poll timeout.`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function interpolate(template: string, inputs: Record<string, unknown>) {
  return template.replace(/\{([A-Z0-9_]+)\}/g, (_, name) => String(inputs[name] ?? ""));
}
