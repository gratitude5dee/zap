import { createFalClient } from "@fal-ai/client";
import { extractUrl, normalizeStatus, parseGenericWebhook, requireSecret } from "./common.ts";
import { ProviderError } from "./errors.ts";
import { priceGeneration } from "./pricing.ts";
import type { GenRequest, ProviderAdapter, ProviderSecrets } from "./types.ts";

export const falAdapter: ProviderAdapter = {
  id: "fal",
  secretTypes: ["fal_key"],
  auth(secrets) {
    return { credentials: requireSecret(secrets, "fal_key", "FAL_KEY") };
  },
  defaultModel(capability) {
    if (capability.startsWith("image.")) return "fal-ai/flux/dev";
    if (capability.startsWith("video.")) return "fal-ai/kling-video/v2.1/pro/image-to-video";
    return "fal-ai/minimax/speech-02-turbo";
  },
  parseWebhook: parseGenericWebhook,
  async validateKey(secrets) {
    try {
      requireSecret(secrets, "fal_key", "FAL_KEY");
      return { ok: true, provider: "fal" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false, provider: "fal" };
    }
  },
  supports(capability, model) {
    return model.startsWith("fal-ai/") && (capability.startsWith("image.") || capability.startsWith("video.") || capability.startsWith("audio."));
  },
  price: priceGeneration,
  async submit(req, idemKey) {
    const client = falClient(req.secrets);
    const model = req.model || falAdapter.defaultModel(req.capability);
    const result = await client.queue.submit(model as never, {
      input: {
        duration: req.durationS,
        image_url: req.inputs.imageUrl,
        image_urls: req.inputs.imageUrls,
        prompt: req.prompt,
      },
      webhookUrl: req.webhookUrl,
      headers: { "x-zap-idempotency-key": idemKey },
    } as never);
    const id = (result as { request_id?: string; requestId?: string }).request_id ?? (result as { requestId?: string }).requestId;
    if (!id) {
      throw new ProviderError("fal queue submit did not return a request id.", { code: "PROVIDER_ERROR", retryable: true });
    }
    return { provider: "fal", requestId: `${model}::${id}` };
  },
  async poll(requestId, secrets) {
    const client = falClient(secrets);
    const [model, id] = requestId.includes("::") ? requestId.split("::", 2) : [falAdapter.defaultModel("image.gen"), requestId];
    const status = await client.queue.status(model, { requestId: id, logs: true } as never);
    const queueStatus = normalizeStatus(String((status as { status?: string }).status ?? ""));
    if (queueStatus === "done") {
      const result = await client.queue.result(model as never, { requestId: id } as never);
      return { outputUrl: extractUrl(result), progress: 1, status: "done" as const };
    }
    if (queueStatus === "failed") return { error: "fal request failed.", status: "failed" };
    return { progress: queueStatus === "running" ? 0.5 : 0.1, status: queueStatus };
  },
};

function falClient(secrets?: ProviderSecrets) {
  return createFalClient({
    credentials: requireSecret(secrets, "fal_key", "FAL_KEY"),
  });
}
