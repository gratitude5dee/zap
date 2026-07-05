import { extractUrl, normalizeProgress, normalizeStatus, parseGenericWebhook, readJsonResponse, requireSecret } from "./common.ts";
import { priceGeneration } from "./pricing.ts";
import type { ProviderAdapter } from "./types.ts";

const GMI_QUEUE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";

export const gmiAdapter: ProviderAdapter = {
  id: "gmi",
  secretTypes: ["gmi_api_key", "gmi_org_id"],
  auth(secrets) {
    return {
      authorization: `Bearer ${requireSecret(secrets, "gmi_api_key", "GMI_API_KEY")}`,
      "x-api-key": requireSecret(secrets, "gmi_api_key", "GMI_API_KEY"),
    };
  },
  defaultModel(capability) {
    if (capability === "video.upscale") return "seedance-2-0-260128-upscale";
    return "seedance-2-0-260128";
  },
  parseWebhook: parseGenericWebhook,
  async validateKey(secrets) {
    try {
      requireSecret(secrets, "gmi_api_key", "GMI_API_KEY");
      requireSecret(secrets, "gmi_org_id", "GMI_ORG_ID");
      return { ok: true, provider: "gmi" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false, provider: "gmi" };
    }
  },
  supports(capability, model) {
    return capability.startsWith("video.") && /seedance|veo|wan|happyhorse|kling|video/i.test(model);
  },
  price: priceGeneration,
  async submit(req, idemKey) {
    const apiKey = requireSecret(req.secrets, "gmi_api_key", "GMI_API_KEY");
    const orgId = requireSecret(req.secrets, "gmi_org_id", "GMI_ORG_ID");
    const response = await fetch(GMI_QUEUE_URL, {
      body: JSON.stringify({
        duration: req.durationS,
        idempotency_key: idemKey,
        image_url: req.inputs.imageUrl,
        image_urls: req.inputs.imageUrls,
        model: req.model,
        organization_id: orgId,
        prompt: req.prompt,
        reference_images: req.inputs.referenceImages,
        webhook_url: req.webhookUrl,
      }),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
      method: "POST",
    });
    const body = await readJsonResponse<{ data?: { id?: string; request_id?: string }; id?: string; request_id?: string }>(response, "gmi");
    return { provider: "gmi", requestId: body.request_id ?? body.id ?? body.data?.request_id ?? body.data?.id ?? idemKey };
  },
  async poll(requestId, secrets) {
    const apiKey = requireSecret(secrets, "gmi_api_key", "GMI_API_KEY");
    const url = new URL(GMI_QUEUE_URL);
    url.searchParams.set("request_id", requestId);
    const response = await fetch(url, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        "x-api-key": apiKey,
      },
    });
    const body = await readJsonResponse<{
      data?: Record<string, unknown>;
      error?: string;
      progress?: number;
      status?: string;
    }>(response, "gmi");
    const data = body.data ?? body;
    return {
      error: typeof data.error === "string" ? data.error : body.error,
      outputUrl: extractUrl(data),
      progress: normalizeProgress(typeof data.progress === "number" ? data.progress : body.progress),
      status: normalizeStatus(typeof data.status === "string" ? data.status : body.status),
    };
  },
};
