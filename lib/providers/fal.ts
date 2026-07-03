import { fal } from "@fal-ai/client";
import type { GenRequest, ProviderAdapter } from "../provider-types";
import { quoteStep } from "../pricing";

export const falAdapter: ProviderAdapter = {
  id: "fal",
  supports(capability) {
    return capability.startsWith("image.") || capability.startsWith("video.") || capability.startsWith("audio.");
  },
  price(req) {
    return quoteStep({ id: req.stepId, kind: req.capability, model: req.model, duration_s: req.durationS });
  },
  async submit(req) {
    requireFalKey(req.secrets?.fal_key);
    const model = normalizeFalModel(req.model, req.capability);
    const result = await fal.queue.submit(model, {
      input: {
        duration: req.durationS,
        image_url: req.inputs.imageUrl,
        image_urls: req.inputs.imageUrls,
        prompt: req.prompt,
      },
      webhookUrl: req.webhookUrl,
    } as never);
    const id = (result as { request_id?: string; requestId?: string }).request_id ?? (result as { requestId?: string }).requestId ?? "";
    return { provider: "fal", requestId: `${model}::${id}` };
  },
  async poll(requestId, secrets) {
    requireFalKey(secrets?.fal_key);
    const [model, id] = requestId.includes("::") ? requestId.split("::", 2) : ["fal-ai/flux/dev", requestId];
    const status = await fal.queue.status(model, { requestId: id, logs: true } as never);
    const queueStatus = String((status as { status?: string }).status ?? "").toLowerCase();
    if (queueStatus.includes("complete")) {
      const result = await fal.queue.result(model, { requestId: id } as never);
      return { outputUrl: extractUrl(result), progress: 1, status: "done" };
    }
    if (queueStatus.includes("fail")) return { status: "failed" };
    return { progress: queueStatus.includes("progress") ? 0.5 : 0.1, status: "running" };
  },
};

function normalizeFalModel(model: string, capability: GenRequest["capability"]) {
  if (model.startsWith("fal-ai/")) return model;
  if (capability.startsWith("image.")) return "fal-ai/flux/dev";
  if (capability.startsWith("video.")) return "fal-ai/kling-video/v2.1/pro/image-to-video";
  return model;
}

function extractUrl(result: unknown): string | undefined {
  const value = result as {
    data?: { images?: Array<{ url?: string }>; video?: { url?: string }; audio?: { url?: string }; url?: string };
  };
  return value.data?.video?.url ?? value.data?.audio?.url ?? value.data?.images?.[0]?.url ?? value.data?.url;
}

function requireFalKey(secretKey?: string) {
  const key = secretKey ?? process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is required for live fal generation.");
  fal.config({ credentials: key });
}
