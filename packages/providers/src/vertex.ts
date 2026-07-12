import { createSign } from "node:crypto";
import { extractUrl, pickString, readJsonResponse } from "./common.ts";
import { ProviderError } from "./errors.ts";
import { priceGeneration } from "./pricing.ts";
import type { Capability, GenRequest, ProviderAdapter, ProviderSecrets } from "./types.ts";

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
  token_uri?: string;
};

const defaultLocation = "us-central1";
const imageIdPrefix = "image::";

export const vertexAdapter: ProviderAdapter = {
  id: "vertex",
  secretTypes: [
    "vertex_project",
    "vertex_location",
    "vertex_api_key",
    "vertex_service_account",
    "vertex_output_gcs_uri",
  ],
  auth(secrets) {
    const apiKey = readOptionalSecret(secrets, "vertex_api_key", "VERTEX_API_KEY");
    const headers: Record<string, string> = {};
    if (apiKey) headers["x-goog-api-key"] = apiKey;
    return headers;
  },
  defaultModel(capability) {
    if (capability.startsWith("video.")) return "veo-3.1-fast-generate-001";
    return "imagen-4.0-generate-001";
  },
  async validateKey(secrets) {
    try {
      readVertexConfig(secrets);
      readVertexAuthMaterial(secrets);
      return { ok: true, provider: "vertex" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false, provider: "vertex" };
    }
  },
  supports(capability, model) {
    if (capability.startsWith("image.")) {
      return model.startsWith("imagen-") || model.startsWith("gemini-");
    }
    if (capability.startsWith("video.")) return model.startsWith("veo-");
    return false;
  },
  price: priceGeneration,
  async submit(req, idemKey) {
    const model = req.model || vertexAdapter.defaultModel(req.capability);
    const config = readVertexConfig(req.secrets);

    if (req.capability.startsWith("video.")) {
      const body = buildVertexVideoBody(req);
      const data = await vertexFetch<{ name?: string }>(
        config,
        req.secrets,
        model,
        "predictLongRunning",
        body,
      );
      const operationName = data.name;
      if (!operationName) {
        throw new ProviderError("Vertex video generation did not return an operation name.", {
          code: "PROVIDER_ERROR",
          retryable: true,
        });
      }
      return { provider: "vertex", requestId: `${model}::${operationName}` };
    }

    const data = await vertexFetch<unknown>(
      config,
      req.secrets,
      model,
      "predict",
      buildVertexImageBody(req, idemKey),
    );
    const outputUrl = extractVertexImageUrl(data) ?? extractUrl(data);
    if (!outputUrl) {
      throw new ProviderError("Vertex image generation did not return an image URL or bytes payload.", {
        code: "PROVIDER_ERROR",
        retryable: true,
      });
    }
    return { provider: "vertex", requestId: encodeImageRequest(model, outputUrl) };
  },
  async poll(requestId, secrets) {
    if (requestId.startsWith(imageIdPrefix)) {
      return { outputUrl: decodeImageRequest(requestId), progress: 1, status: "done" };
    }

    const [model, operationName] = splitOperationRequest(requestId);
    const config = readVertexConfig(secrets);
    const data = await vertexFetch<{
      done?: boolean;
      error?: { message?: string };
      response?: unknown;
    }>(
      config,
      secrets,
      model,
      "fetchPredictOperation",
      { operationName },
    );
    if (!data.done) return { progress: 0.5, status: "running" };
    if (data.error) return { error: data.error.message ?? "Vertex operation failed.", status: "failed" };
    return {
      outputUrl: extractVertexVideoUrl(data.response) ?? extractUrl(data.response),
      progress: 1,
      status: "done",
    };
  },
};

function readVertexConfig(secrets?: ProviderSecrets) {
  const serviceAccount = readServiceAccount(secrets);
  const project = readOptionalSecret(secrets, "vertex_project", "VERTEX_PROJECT") ?? serviceAccount?.project_id;
  if (!project) {
    throw new ProviderError("VERTEX_PROJECT is required for live Vertex calls.", {
      code: "KEY_MISSING",
      retryable: false,
    });
  }
  return {
    location: readOptionalSecret(secrets, "vertex_location", "VERTEX_LOCATION") ?? defaultLocation,
    project,
  };
}

function readVertexAuthMaterial(secrets?: ProviderSecrets) {
  const apiKey = readOptionalSecret(secrets, "vertex_api_key", "VERTEX_API_KEY");
  if (apiKey) return { apiKey };
  const serviceAccount = readServiceAccount(secrets);
  if (serviceAccount?.client_email && serviceAccount.private_key) return { serviceAccount };
  throw new ProviderError("VERTEX_API_KEY or VERTEX_SERVICE_ACCOUNT_JSON is required for live Vertex calls.", {
    code: "KEY_MISSING",
    retryable: false,
  });
}

async function vertexFetch<T>(
  config: { location: string; project: string },
  secrets: ProviderSecrets | undefined,
  model: string,
  action: "fetchPredictOperation" | "predict" | "predictLongRunning",
  body: unknown,
) {
  const auth = readVertexAuthMaterial(secrets);
  const baseUrl = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(config.project)}/locations/${encodeURIComponent(config.location)}/publishers/google/models/${encodeURIComponent(model)}:${action}`;
  const response = await fetch(auth.apiKey ? withQuery(baseUrl, "key", auth.apiKey) : baseUrl, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(auth.serviceAccount ? { authorization: `Bearer ${await accessTokenForServiceAccount(auth.serviceAccount)}` } : {}),
    },
    method: "POST",
  });
  return readJsonResponse<T>(response, "vertex");
}

function buildVertexImageBody(req: GenRequest, idemKey: string) {
  return {
    instances: [{ prompt: req.prompt }],
    parameters: {
      sampleCount: Number(req.inputs.sampleCount ?? 1),
      storageUri: readOptionalSecret(req.secrets, "vertex_output_gcs_uri", "VERTEX_OUTPUT_GCS_URI"),
      zapIdempotencyKey: idemKey,
    },
  };
}

function buildVertexVideoBody(req: GenRequest) {
  const imageUrl = stringInput(req.inputs.imageUrl) ?? stringInput(req.inputs.referenceImageUrl);
  return {
    instances: [
      {
        prompt: req.prompt,
        ...(imageUrl ? { image: { gcsUri: imageUrl } } : {}),
      },
    ],
    parameters: {
      aspectRatio: stringInput(req.inputs.aspectRatio),
      durationSeconds: req.durationS,
      sampleCount: 1,
      storageUri: readOptionalSecret(req.secrets, "vertex_output_gcs_uri", "VERTEX_OUTPUT_GCS_URI"),
    },
  };
}

function extractVertexImageUrl(value: unknown) {
  const gcsUri = pickString(value, [
    ["predictions", "0", "gcsUri"],
    ["predictions", "0", "image", "gcsUri"],
    ["predictions", "0", "uri"],
    ["predictions", "0", "outputUri"],
  ]);
  if (gcsUri) return gcsUri;

  const bytes = pickString(value, [
    ["predictions", "0", "bytesBase64Encoded"],
    ["predictions", "0", "image", "bytesBase64Encoded"],
    ["predictions", "0", "imageBytes"],
    ["generatedImages", "0", "image", "imageBytes"],
  ]);
  if (!bytes) return undefined;
  const mimeType = pickString(value, [
    ["predictions", "0", "mimeType"],
    ["predictions", "0", "image", "mimeType"],
  ]) ?? "image/png";
  return `data:${mimeType};base64,${bytes}`;
}

function extractVertexVideoUrl(value: unknown) {
  const gcsUri = pickString(value, [
    ["videos", "0", "gcsUri"],
    ["videos", "0", "uri"],
    ["generatedVideos", "0", "video", "uri"],
    ["generatedVideos", "0", "video", "gcsUri"],
  ]);
  if (gcsUri) return gcsUri;

  const bytes = pickString(value, [
    ["videos", "0", "bytesBase64Encoded"],
    ["generatedVideos", "0", "video", "bytesBase64Encoded"],
  ]);
  return bytes ? `data:video/mp4;base64,${bytes}` : undefined;
}

function encodeImageRequest(model: string, outputUrl: string) {
  return `${imageIdPrefix}${model}::${Buffer.from(JSON.stringify({ outputUrl })).toString("base64url")}`;
}

function decodeImageRequest(requestId: string) {
  const parts = requestId.split("::");
  const encoded = parts[2];
  if (!encoded) throw new ProviderError("Malformed Vertex image request id.", { code: "PROVIDER_ERROR", retryable: false });
  return (JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { outputUrl: string }).outputUrl;
}

function splitOperationRequest(requestId: string) {
  const [model, operationName] = requestId.split("::", 2);
  if (!model || !operationName) {
    throw new ProviderError("Malformed Vertex operation request id.", { code: "PROVIDER_ERROR", retryable: false });
  }
  return [model, operationName] as const;
}

function readOptionalSecret(secrets: ProviderSecrets | undefined, name: keyof ProviderSecrets, envName: string) {
  return secrets === undefined ? process.env[envName] : secrets[name];
}

function readServiceAccount(secrets?: ProviderSecrets): ServiceAccount | undefined {
  const raw = readOptionalSecret(secrets, "vertex_service_account", "VERTEX_SERVICE_ACCOUNT_JSON");
  if (!raw) return undefined;
  return parseServiceAccount(raw);
}

function parseServiceAccount(raw: string): ServiceAccount {
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ServiceAccount;
    } catch {
      throw new ProviderError("VERTEX_SERVICE_ACCOUNT_JSON must be JSON or base64-encoded JSON.", {
        code: "KEY_INVALID",
        retryable: false,
      });
    }
  }
}

async function accessTokenForServiceAccount(serviceAccount: ServiceAccount) {
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new ProviderError("Vertex service account is missing client_email or private_key.", {
      code: "KEY_INVALID",
      retryable: false,
    });
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    aud: serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
  };
  const unsigned = `${toBase64Url(header)}.${toBase64Url(claim)}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key, "base64url");
  const response = await fetch(serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token", {
    body: new URLSearchParams({
      assertion: `${unsigned}.${signature}`,
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  const data = await readJsonResponse<{ access_token?: string }>(response, "vertex oauth");
  if (!data.access_token) {
    throw new ProviderError("Vertex OAuth token response did not include access_token.", {
      code: "KEY_INVALID",
      retryable: false,
    });
  }
  return data.access_token;
}

function toBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function withQuery(url: string, key: string, value: string) {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function stringInput(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
