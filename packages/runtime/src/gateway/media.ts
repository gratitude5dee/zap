import type { GenRequest, ProviderPollResult, ProviderSecrets } from "@wzrdtech/providers";
import { GatewayError } from "./errors.ts";
import { buildIdempotencyKey, quoteGenerationForMode, selectAdapter, type MediaGenRequest } from "./router.ts";

export type MediaSubmitInput = Omit<MediaGenRequest, "provider" | "model"> & { model?: string };

export interface MediaService {
  readonly provider: string;
  readonly model?: string;
  /** pure; never contacts a provider */
  price(req: MediaSubmitInput, opts: { live: boolean }): { usd: number; warning?: string };
  /** live-only; throws LIVE_REQUIRED in plan-only mode or without a payer (C25) */
  submit(
    req: MediaSubmitInput,
    opts: { live: boolean; payerMode: "missing" | "byok" | "managed" },
  ): Promise<{ idemKey: string; provider: string; requestId: string }>;
  poll(requestId: string, secrets?: ProviderSecrets): Promise<ProviderPollResult>;
}

export function createMediaService(provider: string, opts: { model?: string } = {}): MediaService {
  function fullRequest(req: MediaSubmitInput): MediaGenRequest {
    return { ...req, model: req.model ?? opts.model ?? "", provider };
  }

  return {
    provider,
    model: opts.model,
    price(req, priceOpts) {
      return quoteGenerationForMode(fullRequest(req), priceOpts);
    },
    async submit(req, submitOpts) {
      if (!submitOpts.live || submitOpts.payerMode === "missing") {
        throw new GatewayError({
          code: "LIVE_REQUIRED",
          message: `Submitting to ${provider} spends money; this session is ${submitOpts.live ? "missing a payer" : "plan-only"}.`,
          remediation: "Re-run with --live and a resolvable payer (byok or managed) to submit paid work.",
        });
      }
      const adapter = selectAdapter(fullRequest(req));
      const model = req.model ?? opts.model ?? adapter.defaultModel(req.capability);
      const idemKey = buildIdempotencyKey({ ...req, model, provider });
      const submitted = await adapter.submit({ ...req, model, provider: adapter.id } as GenRequest, idemKey);
      return { idemKey, provider: adapter.id, requestId: submitted.requestId };
    },
    async poll(requestId, secrets) {
      const adapter = selectAdapter({
        capability: "image.gen",
        inputs: {},
        model: opts.model ?? "",
        prompt: "",
        provider,
        runId: "poll",
        stepId: "poll",
      });
      return adapter.poll(requestId, secrets);
    },
  };
}
