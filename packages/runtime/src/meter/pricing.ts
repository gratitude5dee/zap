import type { MeterUnit } from "./units.ts";

export interface SkuPrice {
  unit: MeterUnit;
  usdPerUnit: number;
}

export interface ModelRate {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

/**
 * Shipped SKU price table. `pricing.json` in this directory is the same table
 * as machine-readable data for external tooling; this module is the typed
 * source consumed by the meter.
 */
export const DEFAULT_PRICING: Record<string, SkuPrice> = {
  "box.small": { unit: "sandbox_second", usdPerUnit: 0.018 / 3600 },
  "box.default": { unit: "sandbox_second", usdPerUnit: 0.036 / 3600 },
  "box.large": { unit: "sandbox_second", usdPerUnit: 0.072 / 3600 },
  "api.generic": { unit: "api_call", usdPerUnit: 0.0001 },
  "browser.generic": { unit: "browser_minute", usdPerUnit: 0.002 },
  "computer.generic": { unit: "computer_minute", usdPerUnit: 0.004 },
  "egress.generic": { unit: "egress_byte", usdPerUnit: 1e-10 },
  "gpu.generic": { unit: "gpu_second", usdPerUnit: 0.0006 },
};

export type BoxSize = "small" | "default" | "large";

export const BOX_SKUS: Record<BoxSize, string> = {
  small: "box.small",
  default: "box.default",
  large: "box.large",
};
