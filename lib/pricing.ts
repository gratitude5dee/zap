import type { ZapStep } from "./zap-schema";
import { ZapRunError } from "./zap-errors";
import { listModelRates as listProviderModelRates, modelRates as providerModelRates } from "@wzrdtech/providers";

export const modelRates = providerModelRates;

export function quoteStep(step: ZapStep) {
  const model = step.model ?? "local";
  const rate = modelRates[model];
  if (!rate) {
    throw new ZapRunError({
      alternatives: Object.keys(modelRates).slice(0, 5),
      code: "UNKNOWN_MODEL",
      message: `No pricing is configured for model ${model}.`,
      remediation: "Add this model to lib/pricing.ts or choose a model with known pricing before submitting paid work.",
      retryable: false,
    });
  }
  if (rate.perRequest !== undefined) return rate.perRequest;
  if (rate.perMegapixel !== undefined) return rate.perMegapixel;
  return (rate.perSecond ?? 0) * (step.duration_s ?? 1);
}

export function listModelRates() {
  return listProviderModelRates();
}
