import type { GenRequest, ProviderAdapter } from "../provider-types";
import { quoteStep } from "../pricing";

const GMI_BASE_URL = "https://api.gmicloud.ai/v1";

export const gmiAdapter: ProviderAdapter = {
  id: "gmi",
  supports(capability, model) {
    return capability.startsWith("video.") && (model.includes("seedance") || model.includes("veo") || model.includes("wan"));
  },
  price(req) {
    return quoteStep({ id: req.stepId, kind: req.capability, model: req.model, duration_s: req.durationS });
  },
  async submit(req, idemKey) {
    const apiKey = requireEnv("GMI_API_KEY");
    const response = await fetch(`${GMI_BASE_URL}/video/generations`, {
      body: JSON.stringify({
        duration: req.durationS,
        idempotency_key: idemKey,
        model: req.model,
        organization_id: process.env.GMI_ORG_ID,
        prompt: req.prompt,
        reference_images: req.inputs.referenceImages,
        webhook_url: req.webhookUrl,
      }),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`GMI submit failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { id?: string; request_id?: string };
    return { provider: "gmi", requestId: body.request_id ?? body.id ?? idemKey };
  },
  async poll(requestId) {
    const apiKey = requireEnv("GMI_API_KEY");
    const response = await fetch(`${GMI_BASE_URL}/video/generations/${requestId}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`GMI poll failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as {
      error?: string;
      output_url?: string;
      progress?: number;
      status?: string;
      video_url?: string;
    };
    const status = normalizeStatus(body.status);
    return {
      error: body.error,
      outputUrl: body.output_url ?? body.video_url,
      progress: body.progress,
      status,
    };
  },
};

function normalizeStatus(status?: string) {
  if (status === "completed" || status === "succeeded" || status === "done") return "done";
  if (status === "failed" || status === "error") return "failed";
  if (status === "running" || status === "processing") return "running";
  return "queued";
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live GMI generation.`);
  return value;
}
