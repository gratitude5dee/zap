import type { GenRequest } from "./types.ts";
import { ProviderError } from "./errors.ts";

export const modelRates: Record<string, { perMegapixel?: number; perRequest?: number; perSecond?: number }> = {
  "fal-ai/flux/dev": { perMegapixel: 0.025 },
  "fal-ai/kling-video/v2.1/pro/image-to-video": { perSecond: 0.098 },
  "fal-ai/kling-video/v2.1/pro/text-to-video": { perSecond: 0.098 },
  "fal-ai/veo3.1": { perSecond: 0.45 },
  "gemini-omni-flash-preview": { perSecond: 0.1 },
  "happyhorse-1.1-i2v": { perSecond: 0.28 },
  "prodia/sdxl": { perRequest: 0.01 },
  "runware:100@1": { perRequest: 0.01 },
  "seedance-2-0-260128": { perSecond: 0.07 },
  "seedance-2-0-260128-upscale": { perSecond: 0.056 },
};

export function priceGeneration(req: GenRequest) {
  const rate = modelRates[req.model];
  if (!rate) {
    throw new ProviderError(`No pricing is configured for model ${req.model}.`, {
      code: "PRICE_UNKNOWN",
      retryable: false,
    });
  }
  if (rate.perRequest !== undefined) return rate.perRequest;
  if (rate.perMegapixel !== undefined) return rate.perMegapixel;
  return (rate.perSecond ?? 0) * (req.durationS ?? 1);
}

export function listModelRates() {
  return Object.entries(modelRates).map(([model, rate]) => ({ model, ...rate }));
}
