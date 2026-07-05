import type { ZapSpec, ZapStep } from "./schema.ts";

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
  const steps = expandRepeatSteps(zap, extendCount);
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
  return step.kind === "stitch" || step.kind === "keyframes";
}

export function quoteStep(step: ZapStep) {
  if (isLocalStep(step)) return 0;
  const model = step.model ?? "local";
  const rate = modelRates[model];
  if (!rate) return 0;
  if (rate.perRequest !== undefined) return rate.perRequest;
  return (rate.perSecond ?? 0) * (step.duration_s ?? 1);
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
