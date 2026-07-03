import type { ZapStep } from "./zap-schema";

const modelRates: Record<string, { perSecond?: number; perRequest?: number }> = {
  "fal-ai/flux/dev": { perRequest: 0.03 },
  "fal-ai/kling-video/v2.1/pro/image-to-video": { perSecond: 0.28 },
  "fal-ai/veo3.1": { perSecond: 0.45 },
  "gemini-omni-flash-preview": { perSecond: 0.1 },
  "happyhorse-1.1-i2v": { perSecond: 0.28 },
  "seedance-2-0-260128": { perSecond: 0.07 },
  "seedance-2-0-260128-upscale": { perSecond: 0.056 },
};

export function quoteStep(step: ZapStep) {
  const model = step.model ?? "local";
  const rate = modelRates[model];
  if (!rate) return 0;
  if (rate.perRequest !== undefined) return rate.perRequest;
  return (rate.perSecond ?? 0) * (step.duration_s ?? 1);
}
