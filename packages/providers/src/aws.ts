import { createHash, createHmac } from "node:crypto";
import { pickString, readJsonResponse } from "./common.ts";
import { ProviderError } from "./errors.ts";
import { priceGeneration } from "./pricing.ts";
import type { GenRequest, ProviderAdapter, ProviderSecrets } from "./types.ts";

const bedrockService = "bedrock";
const imageIdPrefix = "image::";

export const awsAdapter: ProviderAdapter = {
  id: "aws",
  secretTypes: [
    "aws_access_key_id",
    "aws_secret_access_key",
    "aws_session_token",
    "aws_region",
    "aws_s3_output_uri",
    "aws_role_arn",
  ],
  auth(secrets) {
    return {
      region: readOptionalSecret(secrets, "aws_region", "AWS_REGION") ?? "us-east-1",
    };
  },
  defaultModel(capability) {
    if (capability.startsWith("video.")) return "amazon.nova-reel-v1:1";
    return "amazon.nova-canvas-v1:0";
  },
  async validateKey(secrets) {
    try {
      readAwsConfig(secrets);
      return { ok: true, provider: "aws" };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), ok: false, provider: "aws" };
    }
  },
  supports(capability, model) {
    if (capability.startsWith("image.")) return model.startsWith("amazon.nova-canvas");
    if (capability.startsWith("video.")) return model.startsWith("amazon.nova-reel");
    return false;
  },
  price: priceGeneration,
  async submit(req, idemKey) {
    const model = req.model || awsAdapter.defaultModel(req.capability);
    const config = readAwsConfig(req.secrets);

    if (req.capability.startsWith("video.")) {
      const s3Uri = readOptionalSecret(req.secrets, "aws_s3_output_uri", "AWS_S3_OUTPUT_URI");
      if (!s3Uri) {
        throw new ProviderError("AWS_S3_OUTPUT_URI is required for Nova Reel async video output.", {
          code: "KEY_MISSING",
          retryable: false,
        });
      }
      const data = await awsJsonFetch<{ invocationArn?: string }>(
        config,
        "POST",
        "/async-invoke",
        {
          clientRequestToken: tokenFromIdemKey(idemKey),
          modelId: model,
          modelInput: buildVideoBody(req, idemKey),
          outputDataConfig: { s3OutputDataConfig: { s3Uri } },
        },
      );
      if (!data.invocationArn) {
        throw new ProviderError("Bedrock StartAsyncInvoke did not return invocationArn.", {
          code: "PROVIDER_ERROR",
          retryable: true,
        });
      }
      return { provider: "aws", requestId: data.invocationArn };
    }

    const data = await awsJsonFetch<unknown>(
      config,
      "POST",
      `/model/${encodeURIComponent(model)}/invoke`,
      buildImageBody(req, idemKey),
    );
    const outputUrl = extractNovaImageUrl(data);
    if (!outputUrl) {
      throw new ProviderError("Bedrock Nova Canvas did not return image bytes.", {
        code: "PROVIDER_ERROR",
        retryable: true,
      });
    }
    return { provider: "aws", requestId: encodeImageRequest(model, outputUrl) };
  },
  async poll(requestId, secrets) {
    if (requestId.startsWith(imageIdPrefix)) {
      return { outputUrl: decodeImageRequest(requestId), progress: 1, status: "done" };
    }
    const config = readAwsConfig(secrets);
    const data = await awsJsonFetch<{
      failureMessage?: string;
      outputDataConfig?: { s3OutputDataConfig?: { s3Uri?: string } };
      status?: "Completed" | "Failed" | "InProgress";
    }>(
      config,
      "GET",
      `/async-invoke/${encodeURIComponent(requestId)}`,
    );
    if (data.status === "Failed") return { error: data.failureMessage ?? "Bedrock async invoke failed.", status: "failed" };
    if (data.status !== "Completed") return { progress: 0.5, status: "running" };

    const s3Uri = data.outputDataConfig?.s3OutputDataConfig?.s3Uri;
    return {
      outputUrl: s3Uri ? `${s3Uri.replace(/\/$/, "")}/output.mp4` : undefined,
      progress: 1,
      status: "done",
    };
  },
};

type AwsConfig = {
  accessKeyId: string;
  region: string;
  secretAccessKey: string;
  sessionToken?: string;
};

function readAwsConfig(secrets?: ProviderSecrets): AwsConfig {
  const accessKeyId = readOptionalSecret(secrets, "aws_access_key_id", "AWS_ACCESS_KEY_ID");
  const secretAccessKey = readOptionalSecret(secrets, "aws_secret_access_key", "AWS_SECRET_ACCESS_KEY");
  const region = readOptionalSecret(secrets, "aws_region", "AWS_REGION") ?? "us-east-1";
  if (!accessKeyId || !secretAccessKey) {
    throw new ProviderError("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for live Bedrock calls.", {
      code: "KEY_MISSING",
      retryable: false,
    });
  }
  return {
    accessKeyId,
    region,
    secretAccessKey,
    sessionToken: readOptionalSecret(secrets, "aws_session_token", "AWS_SESSION_TOKEN"),
  };
}

function readOptionalSecret(secrets: ProviderSecrets | undefined, name: keyof ProviderSecrets, envName: string) {
  return secrets === undefined ? process.env[envName] : secrets[name];
}

function buildImageBody(req: GenRequest, idemKey: string) {
  return {
    imageGenerationConfig: {
      cfgScale: numberInput(req.inputs.cfgScale) ?? 6.5,
      height: numberInput(req.inputs.height) ?? 1024,
      numberOfImages: numberInput(req.inputs.numberOfImages) ?? 1,
      quality: stringInput(req.inputs.quality) ?? "standard",
      seed: seedFromIdemKey(idemKey),
      width: numberInput(req.inputs.width) ?? 1024,
    },
    taskType: "TEXT_IMAGE",
    textToImageParams: { text: req.prompt },
  };
}

function buildVideoBody(req: GenRequest, idemKey: string) {
  return {
    taskType: "TEXT_VIDEO",
    textToVideoParams: { text: req.prompt },
    videoGenerationConfig: {
      dimension: stringInput(req.inputs.dimension) ?? "1280x720",
      durationSeconds: req.durationS ?? 6,
      fps: numberInput(req.inputs.fps) ?? 24,
      seed: seedFromIdemKey(idemKey),
    },
  };
}

async function awsJsonFetch<T>(
  config: AwsConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
) {
  const host = `bedrock-runtime.${config.region}.amazonaws.com`;
  const bodyText = body === undefined ? "" : JSON.stringify(body);
  const headers = signAwsRequest({
    body: bodyText,
    config,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    host,
    method,
    path,
  });
  const response = await fetch(`https://${host}${path}`, {
    body: method === "GET" ? undefined : bodyText,
    headers,
    method,
  });
  return readJsonResponse<T>(response, "aws");
}

function signAwsRequest({
  body,
  config,
  headers,
  host,
  method,
  path,
}: {
  body: string;
  config: AwsConfig;
  headers: Record<string, string>;
  host: string;
  method: "GET" | "POST";
  path: string;
}) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const signingHeaders: Record<string, string> = {
    ...headers,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...(config.sessionToken ? { "x-amz-security-token": config.sessionToken } : {}),
  };

  const canonicalHeaderPairs = Object.entries(signingHeaders)
    .map(([key, value]) => [key.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const canonicalHeaders = canonicalHeaderPairs.map(([key, value]) => `${key}:${value}`).join("\n");
  const signedHeaders = canonicalHeaderPairs.map(([key]) => key).join(";");
  const credentialScope = `${dateStamp}/${config.region}/${bedrockService}/aws4_request`;
  const canonicalRequest = [
    method,
    path,
    "",
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = getSignatureKey(config.secretAccessKey, dateStamp, config.region, bedrockService);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    ...signingHeaders,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function extractNovaImageUrl(value: unknown) {
  const bytes = pickString(value, [
    ["images", "0"],
    ["output", "images", "0"],
    ["image", "bytesBase64Encoded"],
  ]);
  return bytes ? `data:image/png;base64,${bytes}` : undefined;
}

function encodeImageRequest(model: string, outputUrl: string) {
  return `${imageIdPrefix}${model}::${Buffer.from(JSON.stringify({ outputUrl })).toString("base64url")}`;
}

function decodeImageRequest(requestId: string) {
  const parts = requestId.split("::");
  const encoded = parts[2];
  if (!encoded) throw new ProviderError("Malformed AWS image request id.", { code: "PROVIDER_ERROR", retryable: false });
  return (JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { outputUrl: string }).outputUrl;
}

function tokenFromIdemKey(idemKey: string) {
  return createHash("sha256").update(idemKey).digest("hex").slice(0, 64);
}

function seedFromIdemKey(idemKey: string) {
  return Number.parseInt(createHash("sha256").update(idemKey).digest("hex").slice(0, 8), 16) % 2_147_483_646;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function getSignatureKey(secretAccessKey: string, dateStamp: string, regionName: string, serviceName: string) {
  const kDate = createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = createHmac("sha256", kDate).update(regionName).digest();
  const kService = createHmac("sha256", kRegion).update(serviceName).digest();
  return createHmac("sha256", kService).update("aws4_request").digest();
}

function stringInput(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberInput(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
