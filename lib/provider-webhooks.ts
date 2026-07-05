import type { ProviderPollResult } from "./provider-types";
import { getRedis } from "./redis";
import { addAssetLedger, getRunSnapshot, updateRunLedger, upsertStepLedger } from "./run-ledger";
import { getProviderAdapter } from "@wzrdtech/providers";

type ProviderWebhookProvider = "fal" | "gmi" | "prodia" | "runware";
type ProviderWebhookSource = { url?: string };
type ProviderProgressMeta = {
  capability?: string;
  requestId?: string;
  runId?: string;
  stepId?: string;
};

export function buildProviderWebhookUrl(provider: string, meta: Required<Pick<ProviderProgressMeta, "runId" | "stepId">> & Pick<ProviderProgressMeta, "capability">) {
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) return undefined;
  const webhookSecret = process.env.ZAP_PROVIDER_WEBHOOK_SECRET;
  if (!webhookSecret && process.env.NODE_ENV === "production") return undefined;

  const url = new URL(`/api/providers/${provider}/webhook`, baseUrl);
  url.searchParams.set("runId", meta.runId);
  url.searchParams.set("stepId", meta.stepId);
  if (meta.capability) url.searchParams.set("capability", meta.capability);
  if (webhookSecret) {
    url.searchParams.set("secret", webhookSecret);
  }
  return url.toString();
}

export async function recordProviderWebhook(provider: ProviderWebhookProvider, payload: unknown, source: ProviderWebhookSource = {}) {
  const redis = getRedis();
  if (redis) {
    await redis.lpush(`zap:webhook:${provider}`, JSON.stringify({ payload, sourceUrl: source.url, ts: Date.now() }));
  }

  const parsed = getProviderAdapter(provider).parseWebhook?.(payload, source.url) ?? parseProviderWebhook(payload, source.url);
  return recordProviderProgress(provider, parsed, parsed);
}

export async function recordProviderProgress(provider: ProviderWebhookProvider | string, result: ProviderPollResult, meta: ProviderProgressMeta) {
  if (!meta.runId || !meta.stepId) {
    return {
      observed: false,
      provider,
      reason: "missing_run_or_step",
      requestId: meta.requestId,
      status: result.status,
    };
  }

  const snapshot = await getRunSnapshot(meta.runId);
  if (!snapshot.run) {
    return {
      observed: false,
      provider,
      reason: "run_not_found",
      requestId: meta.requestId,
      runId: meta.runId,
      status: result.status,
      stepId: meta.stepId,
    };
  }

  const existingStep = snapshot.steps.find((step) => step.stepId === meta.stepId);
  const status = result.status === "failed" ? "failed" : result.status === "done" ? "done" : result.status === "queued" ? "queued" : "running";
  const progress = result.progress ?? (status === "done" || status === "failed" ? 1 : status === "queued" ? 0 : 0.5);

  await upsertStepLedger({
    actualUsd: result.actualUsd ?? existingStep?.actualUsd,
    error: result.error ?? existingStep?.error,
    kind: existingStep?.kind ?? meta.capability ?? "unknown",
    model: existingStep?.model,
    priceQuoteUsd: existingStep?.priceQuoteUsd ?? 0,
    progress,
    provider,
    providerRequestId: meta.requestId ?? existingStep?.providerRequestId,
    runId: meta.runId,
    status,
    stepId: meta.stepId,
  });

  let assetId: string | undefined;
  if (status === "done" && result.outputUrl) {
    assetId = await addAssetLedger({
      kind: inferAssetKind(result.outputUrl),
      parents: [],
      runId: meta.runId,
      stepId: meta.stepId,
      url: result.outputUrl,
    });
  }

  const nextSnapshot = await getRunSnapshot(meta.runId);
  const costUsd = nextSnapshot.steps.reduce((sum, step) => sum + (step.actualUsd ?? (step.status === "done" ? step.priceQuoteUsd : 0)), 0);
  const allStepsTerminal = nextSnapshot.steps.length > 0 && nextSnapshot.steps.every((step) => step.status === "done" || step.status === "skipped");
  const runStatus = status === "failed" ? "failed" : allStepsTerminal ? "done" : "running";
  await updateRunLedger({
    costUsd,
    error: status === "failed" ? result.error : nextSnapshot.run?.error,
    runId: meta.runId,
    stage: status === "failed" ? `${meta.stepId}:failed` : allStepsTerminal ? "complete" : `${meta.stepId}:webhook_${status}`,
    status: runStatus,
    zapUrl: allStepsTerminal ? result.outputUrl ?? nextSnapshot.run?.zapUrl : nextSnapshot.run?.zapUrl,
  });

  return {
    assetId,
    observed: true,
    provider,
    requestId: meta.requestId,
    runId: meta.runId,
    status,
    stepId: meta.stepId,
  };
}

function parseProviderWebhook(payload: unknown, sourceUrl?: string): ProviderPollResult & ProviderProgressMeta {
  const query = readQuery(sourceUrl);
  const requestId = query.get("requestId") ?? pickString(payload, [
    ["request_id"],
    ["requestId"],
    ["id"],
    ["data", "request_id"],
    ["data", "requestId"],
    ["data", "id"],
    ["payload", "request_id"],
    ["payload", "requestId"],
  ]);
  const status = normalizeStatus(query.get("status") ?? pickString(payload, [
    ["status"],
    ["state"],
    ["data", "status"],
    ["data", "state"],
    ["payload", "status"],
    ["payload", "state"],
  ]));

  return {
    actualUsd: pickNumber(payload, [["actualUsd"], ["actual_usd"], ["costUsd"], ["cost_usd"], ["data", "cost_usd"]]),
    capability: query.get("capability") ?? pickString(payload, [["capability"], ["kind"], ["metadata", "capability"]]),
    error: pickString(payload, [["error"], ["error", "message"], ["data", "error"], ["payload", "error"]]),
    outputUrl: extractOutputUrl(payload),
    progress: normalizeProgress(pickNumber(payload, [["progress"], ["percentage"], ["percent"], ["data", "progress"], ["payload", "progress"]])),
    requestId,
    runId: query.get("runId") ?? pickString(payload, [["runId"], ["run_id"], ["metadata", "runId"], ["metadata", "run_id"]]),
    status,
    stepId: query.get("stepId") ?? pickString(payload, [["stepId"], ["step_id"], ["metadata", "stepId"], ["metadata", "step_id"]]),
  };
}

function readQuery(sourceUrl?: string) {
  if (!sourceUrl) return new URLSearchParams();
  try {
    return new URL(sourceUrl).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function normalizeStatus(status?: string | null): ProviderPollResult["status"] {
  const normalized = status?.toLowerCase();
  if (normalized === "complete" || normalized === "completed" || normalized === "succeeded" || normalized === "success" || normalized === "done") return "done";
  if (normalized === "failed" || normalized === "failure" || normalized === "error" || normalized === "errored") return "failed";
  if (normalized === "running" || normalized === "processing" || normalized === "in_progress" || normalized === "progress") return "running";
  return "queued";
}

function normalizeProgress(progress?: number) {
  if (progress === undefined || Number.isNaN(progress)) return undefined;
  if (progress > 1) return Math.max(0, Math.min(1, progress / 100));
  return Math.max(0, Math.min(1, progress));
}

function extractOutputUrl(payload: unknown) {
  return pickString(payload, [
    ["outputUrl"],
    ["output_url"],
    ["videoUrl"],
    ["video_url"],
    ["imageUrl"],
    ["image_url"],
    ["audioUrl"],
    ["audio_url"],
    ["url"],
    ["data", "url"],
    ["data", "output_url"],
    ["data", "video", "url"],
    ["data", "audio", "url"],
    ["data", "image", "url"],
    ["data", "images", "0", "url"],
    ["payload", "url"],
    ["payload", "output_url"],
  ]);
}

function pickString(value: unknown, paths: string[][]) {
  for (const path of paths) {
    const picked = pick(value, path);
    if (typeof picked === "string" && picked.length > 0) return picked;
    if (typeof picked === "number" && Number.isFinite(picked)) return String(picked);
  }
  return undefined;
}

function pickNumber(value: unknown, paths: string[][]) {
  for (const path of paths) {
    const picked = pick(value, path);
    if (typeof picked === "number" && Number.isFinite(picked)) return picked;
    if (typeof picked === "string" && picked.trim() !== "") {
      const parsed = Number(picked);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function pick(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) return current[Number(segment)];
    if (isRecord(current)) return current[segment];
    return undefined;
  }, value);
}

function inferAssetKind(url: string) {
  const lower = url.split("?")[0]?.toLowerCase() ?? url.toLowerCase();
  if (lower.startsWith("data:image/") || /\.(png|jpe?g|webp)$/.test(lower)) return "png";
  if (lower.startsWith("data:audio/") || /\.(wav|mp3|m4a|aac)$/.test(lower)) return "wav";
  if (lower.endsWith(".json")) return "json";
  return "mp4";
}

function getPublicBaseUrl() {
  const raw = process.env.ZAP_PUBLIC_BASE_URL
    ?? process.env.NEXT_PUBLIC_SITE_URL
    ?? process.env.VERCEL_PROJECT_PRODUCTION_URL
    ?? process.env.VERCEL_URL;
  if (!raw) return undefined;
  const withProtocol = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
  return withProtocol.endsWith("/") ? withProtocol : `${withProtocol}/`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
