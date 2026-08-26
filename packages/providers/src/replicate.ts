import { ProviderError } from "./errors.ts";
import { priceGeneration } from "./pricing.ts";
import type { GenRequest, ProviderPollResult, ProviderSecrets, ProviderValidationResult } from "./types.ts";

const API_BASE = "https://api.replicate.com/v1";

/** Secrets bag extended with the Replicate token until the shared union gains the member. */
export type ReplicateSecrets = ProviderSecrets & { replicate_api_token?: string };

function requireToken(secrets?: ReplicateSecrets): string {
  const token = secrets === undefined ? process.env.REPLICATE_API_TOKEN : secrets.replicate_api_token;
  if (!token) {
    throw new ProviderError("REPLICATE_API_TOKEN is required for live provider calls.", {
      code: "KEY_MISSING",
      retryable: false,
    });
  }
  return token;
}

function normalizeStatus(status: string): ProviderPollResult["status"] {
  if (status === "succeeded") return "done";
  if (status === "failed" || status === "canceled") return "failed";
  if (status === "processing") return "running";
  return "queued";
}

function extractOutputUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  return undefined;
}

export const replicateAdapter = {
  id: "replicate" as const,
  secretTypes: ["replicate_api_token"] as const,
  auth(secrets?: ReplicateSecrets) {
    return { Authorization: `Bearer ${requireToken(secrets)}` };
  },
  defaultModel(capability: GenRequest["capability"]): string {
    if (capability.startsWith("image.")) return "black-forest-labs/flux-dev";
    if (capability.startsWith("video.")) return "wan-video/wan-2.2-i2v-fast";
    return "minimax/speech-02-turbo";
  },
  async validateKey(secrets?: ReplicateSecrets): Promise<Omit<ProviderValidationResult, "provider"> & { provider: "replicate" }> {
    try {
      requireToken(secrets);
      return { ok: true, provider: "replicate" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false, provider: "replicate" };
    }
  },
  supports(capability: GenRequest["capability"], model: string): boolean {
    return model.includes("/")
      && !model.startsWith("fal-ai/")
      && (capability.startsWith("image.") || capability.startsWith("video.") || capability.startsWith("audio."));
  },
  price: priceGeneration,
  async submit(req: GenRequest, idemKey: string) {
    const model = req.model || replicateAdapter.defaultModel(req.capability);
    const response = await fetch(`${API_BASE}/models/${model}/predictions`, {
      method: "POST",
      headers: {
        ...replicateAdapter.auth(req.secrets as ReplicateSecrets),
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      },
      body: JSON.stringify({
        input: {
          duration: req.durationS,
          image: req.inputs.imageUrl,
          prompt: req.prompt,
        },
        webhook: req.webhookUrl,
      }),
    });
    if (!response.ok) {
      throw new ProviderError(`replicate submit failed with status ${response.status}.`, {
        code: "PROVIDER_ERROR",
        retryable: response.status >= 500,
      });
    }
    const body = (await response.json()) as { id?: string };
    if (!body.id) {
      throw new ProviderError("replicate submit did not return a prediction id.", {
        code: "PROVIDER_ERROR",
        retryable: true,
      });
    }
    return { provider: "replicate", requestId: body.id };
  },
  async poll(requestId: string, secrets?: ReplicateSecrets): Promise<ProviderPollResult> {
    const response = await fetch(`${API_BASE}/predictions/${requestId}`, {
      headers: replicateAdapter.auth(secrets),
    });
    if (!response.ok) {
      throw new ProviderError(`replicate poll failed with status ${response.status}.`, {
        code: "PROVIDER_ERROR",
        retryable: response.status >= 500,
      });
    }
    const body = (await response.json()) as { status?: string; output?: unknown; error?: string };
    const status = normalizeStatus(String(body.status ?? ""));
    if (status === "done") return { outputUrl: extractOutputUrl(body.output), progress: 1, status };
    if (status === "failed") return { error: body.error ?? "replicate prediction failed.", status };
    return { progress: status === "running" ? 0.5 : 0.1, status };
  },
};
