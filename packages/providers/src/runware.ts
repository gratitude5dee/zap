import { extractUrl, normalizeProgress, normalizeStatus, parseGenericWebhook, readJsonResponse, requireSecret } from "./common.ts";
import { priceGeneration } from "./pricing.ts";
import type { ProviderAdapter } from "./types.ts";

const RUNWARE_URL = "https://api.runware.ai/v1";

export const runwareAdapter: ProviderAdapter = {
  id: "runware",
  secretTypes: ["runware_key"],
  auth(secrets) {
    return { authorization: `Bearer ${requireSecret(secrets, "runware_key", "RUNWARE_KEY")}` };
  },
  defaultModel() {
    return "runware:100@1";
  },
  parseWebhook: parseGenericWebhook,
  async validateKey(secrets) {
    try {
      requireSecret(secrets, "runware_key", "RUNWARE_KEY");
      return { ok: true, provider: "runware" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false, provider: "runware" };
    }
  },
  supports(capability, model) {
    return capability.startsWith("image.") && (model.startsWith("runware") || model.includes("@"));
  },
  price: priceGeneration,
  async submit(req, idemKey) {
    const taskUUID = idemKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    const response = await fetch(RUNWARE_URL, {
      body: JSON.stringify([
        {
          outputType: "URL",
          positivePrompt: req.prompt,
          referenceImages: req.inputs.imageUrls,
          taskType: req.capability === "image.edit" ? "imageInference" : "imageInference",
          taskUUID,
        },
      ]),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${requireSecret(req.secrets, "runware_key", "RUNWARE_KEY")}`,
      },
      method: "POST",
    });
    const body = await readJsonResponse<{ data?: Array<{ taskUUID?: string }> }>(response, "runware");
    return { provider: "runware", requestId: body.data?.[0]?.taskUUID ?? taskUUID };
  },
  async poll(requestId, secrets) {
    const response = await fetch(RUNWARE_URL, {
      body: JSON.stringify([{ taskType: "getResponse", taskUUID: requestId }]),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${requireSecret(secrets, "runware_key", "RUNWARE_KEY")}`,
      },
      method: "POST",
    });
    const body = await readJsonResponse<{ data?: unknown[]; errors?: Array<{ message?: string }> }>(response, "runware");
    const first = body.data?.[0];
    return {
      error: body.errors?.map((error) => error.message).filter(Boolean).join("; "),
      outputUrl: extractUrl(first ?? body),
      progress: normalizeProgress(typeof first === "object" && first && "progress" in first ? Number((first as { progress?: unknown }).progress) : undefined),
      status: body.errors?.length ? "failed" : normalizeStatus(typeof first === "object" && first && "status" in first ? String((first as { status?: unknown }).status) : undefined),
    };
  },
};
