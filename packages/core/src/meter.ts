/**
 * Metering units for Zap runtimes. Defined in core (additive) so that
 * @wzrdtech/zap-agent can name them without depending on the runtime package.
 */
export type MeterUnit =
  | "sandbox_second"
  | "gateway_input_token"
  | "gateway_output_token"
  | "media_request"
  | "gpu_second"
  | "api_call"
  | "browser_minute"
  | "computer_minute"
  | "egress_byte";

export interface MeterLine {
  unit: MeterUnit;
  qty: number;
  usd: number;
  /** e.g. "box.default", "openrouter/anthropic/claude-sonnet-4.6", "fal-ai/flux/dev" */
  sku: string;
}
