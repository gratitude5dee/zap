import { extractUrl, normalizeProgress, normalizeStatus, parseGenericWebhook, readJsonResponse, requireSecret } from "./common.ts";
import { priceGeneration } from "./pricing.ts";
import type { ProviderAdapter } from "./types.ts";

const PRODIA_BASE_URL = "https://api.prodia.com/v2";

export const prodiaAdapter: ProviderAdapter = {
  id: "prodia",
  secretTypes: ["prodia_token"],
  auth(secrets) {
    return { authorization: `Bearer ${requireSecret(secrets, "prodia_token", "PRODIA_TOKEN")}` };
  },
  defaultModel() {
    return "prodia/sdxl";
  },
  parseWebhook: parseGenericWebhook,
  async validateKey(secrets) {
    try {
      requireSecret(secrets, "prodia_token", "PRODIA_TOKEN");
      return { ok: true, provider: "prodia" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false, provider: "prodia" };
    }
  },
  supports(capability, model) {
    return capability.startsWith("image.") && (model.startsWith("prodia/") || model.includes("sdxl"));
  },
  price: priceGeneration,
  async submit(req, idemKey) {
    const response = await fetch(`${PRODIA_BASE_URL}/job`, {
      body: JSON.stringify({
        input: {
          image_url: req.inputs.imageUrl,
          image_urls: req.inputs.imageUrls,
          prompt: req.prompt,
        },
        model: req.model.replace(/^prodia\//, ""),
        webhook_url: req.webhookUrl,
      }),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${requireSecret(req.secrets, "prodia_token", "PRODIA_TOKEN")}`,
        "x-zap-idempotency-key": idemKey,
      },
      method: "POST",
    });
    const body = await readJsonResponse<{ data?: { id?: string; job?: string }; id?: string; job?: string }>(response, "prodia");
    return { provider: "prodia", requestId: body.id ?? body.job ?? body.data?.id ?? body.data?.job ?? idemKey };
  },
  async poll(requestId, secrets) {
    const response = await fetch(`${PRODIA_BASE_URL}/job/${encodeURIComponent(requestId)}`, {
      headers: { authorization: `Bearer ${requireSecret(secrets, "prodia_token", "PRODIA_TOKEN")}` },
    });
    const body = await readJsonResponse<Record<string, unknown>>(response, "prodia");
    return {
      error: typeof body.error === "string" ? body.error : undefined,
      outputUrl: extractUrl(body),
      progress: normalizeProgress(typeof body.progress === "number" ? body.progress : undefined),
      status: normalizeStatus(typeof body.status === "string" ? body.status : typeof body.state === "string" ? body.state : undefined),
    };
  },
};
