import { isCommerceStep, type ZapListing, type ZapSpec, type ZapStep } from "./schema.ts";

const SEEDANCE_FAST_MODEL = "seedance-2-0-fast-260128";
const SEEDANCE_FAST_RATE_ENVIRONMENT_VARIABLE = "GMI_SEEDANCE_FAST_USD_PER_SECOND";

export type PlannedZapStep = ZapStep & {
  originalId: string;
  repeatIndex?: number;
};

export type ZapPlan = {
  budgetCapUsd: number;
  estimateUsd: number;
  extendCount: number;
  steps: PlannedZapStep[];
  zap: string;
};

const modelRates: Record<string, { perSecond?: number; perRequest?: number }> = {
  "fal-ai/flux/dev": { perRequest: 0.03 },
  "fal-ai/kling-video/v2.1/pro/image-to-video": { perSecond: 0.28 },
  "fal-ai/veo3.1": { perSecond: 0.45 },
  "gemini-omni-flash-preview": { perSecond: 0.1 },
  "happyhorse-1.1-i2v": { perSecond: 0.28 },
  "seedance-2-0-260128": { perSecond: 0.07 },
  "seedance-2-0-260128-upscale": { perSecond: 0.056 },
};

export function planZapRun(zap: ZapSpec, extendCount: number): ZapPlan {
  const steps = orderCommerceSteps(expandRepeatSteps(zap, extendCount));
  const estimateUsd = steps.reduce((sum, step) => sum + quoteStep(step), 0);
  return {
    budgetCapUsd: zap.budget.cap_usd,
    estimateUsd,
    extendCount,
    steps,
    zap: zap.zap,
  };
}

export function assertWithinBudget(plan: ZapPlan) {
  if (plan.estimateUsd > plan.budgetCapUsd) {
    throw new Error(`Run quote $${plan.estimateUsd.toFixed(2)} exceeds recipe cap $${plan.budgetCapUsd}.`);
  }
}

export function validateRequiredInputs(zap: ZapSpec, inputs: Record<string, unknown>) {
  for (const [name, spec] of Object.entries(zap.inputs)) {
    if (spec.required && inputs[name] === undefined) {
      throw new Error(`Missing required input ${name}.`);
    }
  }
}

export function isLocalStep(step: ZapStep) {
  return step.kind === "stitch" || step.kind === "keyframes" || isCommerceStep(step);
}

/**
 * Commerce steps consume media produced earlier and spend nothing themselves,
 * so they always run after every provider/local media step. Their relative
 * order is preserved.
 */
export function orderCommerceSteps<T extends ZapStep>(steps: T[]): T[] {
  const media = steps.filter((step) => !isCommerceStep(step));
  const commerce = steps.filter((step) => isCommerceStep(step));
  return [...media, ...commerce];
}

export type StagedListingPreview = {
  action: "stage_listing";
  charges: false;
  imageFrom: string | null;
  inventory: number | null | string;
  key: string;
  kind: ZapListing["kind"];
  name: string;
  priceCents: number | string;
  requiresOwnerApproval: true;
};

/** Describe what a commerce.stage_listing step WOULD stage — never performs it. */
export function describeStagedListing(step: ZapStep, inputs: Record<string, unknown> = {}): StagedListingPreview {
  if (step.kind !== "commerce.stage_listing" || !step.listing) {
    throw new Error(`Step ${step.id} is not a commerce.stage_listing step.`);
  }
  const listing = step.listing;
  const name = interpolateInputs(listing.name, inputs);
  return {
    action: "stage_listing",
    charges: false,
    imageFrom: listing.image ?? null,
    inventory: resolveListingRef(listing.inventory ?? null, inputs, null),
    key: listing.key ?? listingKey(name),
    kind: listing.kind,
    name,
    priceCents: resolveListingRef(listing.priceCents, inputs),
    requiresOwnerApproval: true,
  };
}

export function listingKey(name: string) {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return key || "item";
}

export function interpolateInputs(template: string, inputs: Record<string, unknown>) {
  return template.replace(/\{([A-Z0-9_]+)\}/g, (_, variable: string) => {
    const value = inputs[variable];
    return value === undefined || value === null ? "" : String(value);
  });
}

function resolveListingRef<T extends number | null>(
  ref: T | string,
  inputs: Record<string, unknown>,
  whenUnset: T | string = ref,
): T | number | string {
  if (typeof ref !== "string") return ref;
  const value = inputs[ref.slice("user.".length)];
  if (value === undefined || value === null || value === "") return whenUnset;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : ref;
}

export function quoteStep(step: ZapStep) {
  if (isLocalStep(step)) return 0;
  const model = step.model ?? "local";
  if (model === SEEDANCE_FAST_MODEL) {
    const perSecond = configuredSeedanceFastRate();
    if (perSecond === undefined) {
      throw new Error(
        `No pricing is configured for model ${SEEDANCE_FAST_MODEL}. `
        + `Set ${SEEDANCE_FAST_RATE_ENVIRONMENT_VARIABLE} from the current GMI console before planning it.`,
      );
    }
    return perSecond * (step.duration_s ?? 1);
  }
  const rate = modelRates[model];
  if (!rate) return 0;
  if (rate.perRequest !== undefined) return rate.perRequest;
  return (rate.perSecond ?? 0) * (step.duration_s ?? 1);
}

function configuredSeedanceFastRate() {
  const raw = process.env[SEEDANCE_FAST_RATE_ENVIRONMENT_VARIABLE]?.trim();
  if (!raw) return undefined;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

export function expandRepeatSteps(zap: ZapSpec, extendCount: number): PlannedZapStep[] {
  return zap.steps.flatMap((step) => {
    if (step.kind !== "video.extend") return [{ ...step, originalId: step.id }];
    const max = step.repeat?.max ?? 64;
    const min = step.repeat?.min ?? 0;
    const count = Math.max(min, Math.min(extendCount, max));
    return Array.from({ length: count }, (_, index) => ({
      ...step,
      id: `${step.id}_${index + 1}`,
      originalId: step.id,
      repeatIndex: index + 1,
    }));
  });
}
