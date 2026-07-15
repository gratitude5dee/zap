import { extractUrl, normalizeProgress, normalizeStatus, parseGenericWebhook, pickString, providerFailureCode, readJsonResponse, requireSecret } from "./common.ts";
import { ProviderError } from "./errors.ts";
import { priceGeneration } from "./pricing.ts";
import type { ProviderAdapter } from "./types.ts";

const GMI_QUEUE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";
const GMI_REQUESTS_URL = `${GMI_QUEUE_URL}/requests`;
const AIR_SEEDANCE_FAST_MODEL = "seedance-2-0-fast-260128";
// Queue submit/poll are short control-plane calls; video rendering happens
// asynchronously. Bound them so a stalled provider connection cannot pin a
// Vercel function or an Air admission slot indefinitely.
const GMI_REQUEST_TIMEOUT_MS = 30_000;

type GmiResponseData = {
  data?: GmiResponseData;
  error?: unknown;
  message?: unknown;
  outcome?: unknown;
  progress?: unknown;
  request_id?: unknown;
  requestId?: unknown;
  status?: unknown;
};

export const gmiAdapter: ProviderAdapter = {
  id: "gmi",
  secretTypes: ["gmi_api_key"],
  auth(secrets) {
    return {
      authorization: `Bearer ${requireSecret(secrets, "gmi_api_key", "GMI_API_KEY")}`,
    };
  },
  defaultModel(capability) {
    if (capability === "video.upscale") return "seedance-2-0-260128-upscale";
    return AIR_SEEDANCE_FAST_MODEL;
  },
  parseWebhook: parseGenericWebhook,
  async validateKey(secrets) {
    try {
      requireSecret(secrets, "gmi_api_key", "GMI_API_KEY");
      return { ok: true, provider: "gmi" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false, provider: "gmi" };
    }
  },
  supports(capability, model) {
    return capability.startsWith("video.") && /seedance|veo|wan|happyhorse|kling|video/i.test(model);
  },
  price: priceGeneration,
  async submit(req, _idemKey) {
    const apiKey = requireSecret(req.secrets, "gmi_api_key", "GMI_API_KEY");
    const model = req.model || gmiAdapter.defaultModel(req.capability);
    const response = await fetchGmi(GMI_REQUESTS_URL, {
      body: JSON.stringify({
        model,
        payload: buildGmiPayload(req, model),
      }),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      method: "POST",
    });
    const body = await readJsonResponse<GmiResponseData>(response, "gmi");
    const data = body.data ?? body;
    const requestId = readRequestId(data) ?? readRequestId(body);
    if (!requestId) {
      throw new ProviderError("GMI submit did not return a request_id.", {
        code: "PROVIDER_ERROR",
        retryable: true,
      });
    }
    return { provider: "gmi", requestId };
  },
  async poll(requestId, secrets) {
    const apiKey = requireSecret(secrets, "gmi_api_key", "GMI_API_KEY");
    const response = await fetchGmi(`${GMI_REQUESTS_URL}/${encodeURIComponent(requestId)}`, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });
    const body = await readJsonResponse<GmiResponseData>(response, "gmi");
    const data = body.data ?? body;
    const status = normalizeStatus(stringValue(data.status) ?? stringValue(body.status));
    const providerProgress = numberValue(data.progress) ?? numberValue(body.progress);
    return {
      // GMI can include the submitted prompt or signed media URLs in a
      // terminal error. Return only a stable category because this value is
      // later written into durable run state.
      error: providerFailureCode(readError(data) ?? readError(body)),
      outputUrl: extractGmiVideoUrl(data) ?? extractGmiVideoUrl(body),
      progress: normalizeProgress(providerProgress) ?? defaultProgress(status),
      status,
    };
  },
};

function buildGmiPayload(req: Parameters<ProviderAdapter["submit"]>[0], model: string) {
  const firstFrame = firstString(
    req.inputs.firstFrameUrl,
    req.inputs.first_frame,
    req.inputs.firstFrame,
    req.inputs.imageUrl,
    req.inputs.image_url,
  );
  const referenceImages = stringArray(req.inputs.referenceImages ?? req.inputs.reference_images);
  const launchPreset = model === AIR_SEEDANCE_FAST_MODEL;

  return {
    prompt: req.prompt,
    ...(firstFrame ? { first_frame: firstFrame } : referenceImages.length ? { reference_images: referenceImages } : {}),
    duration: launchPreset ? 5 : numberValue(req.durationS) ?? 5,
    resolution: launchPreset ? "720p" : firstString(req.inputs.resolution) ?? "720p",
    ratio: launchPreset ? "adaptive" : firstString(req.inputs.ratio, req.inputs.aspectRatio) ?? "adaptive",
    // GMI documents null as a random seed. Air intentionally does not reuse
    // a deterministic seed across users or retries.
    seed: launchPreset ? null : numberValue(req.inputs.seed) ?? null,
    generate_audio: launchPreset ? true : booleanValue(req.inputs.generateAudio, req.inputs.generate_audio) ?? true,
    watermark: false,
    web_search: false,
  };
}

function extractGmiVideoUrl(value: unknown) {
  return pickString(value, [
    ["outcome", "video_url"],
    ["outcome", "videoUrl"],
    ["outcome", "media_urls", "0", "url"],
    ["outcome", "media_urls", "0"],
  ]) ?? extractUrl(value);
}

function readRequestId(value: GmiResponseData) {
  return firstString(value.request_id, value.requestId);
}

function readError(value: GmiResponseData) {
  return pickString(value, [["error", "message"], ["error"], ["message"], ["outcome", "error"]]);
}

async function fetchGmi(url: string, init: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(GMI_REQUEST_TIMEOUT_MS) });
  } catch {
    // Network/timeout exceptions sometimes include transport diagnostics. Do
    // not let them escape into a persisted run error.
    throw new ProviderError("gmi request unavailable.", {
      code: "PROVIDER_ERROR",
      retryable: true,
    });
  }
}

function defaultProgress(status: ReturnType<typeof normalizeStatus>) {
  if (status === "done") return 1;
  if (status === "running") return 0.5;
  return 0;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}
