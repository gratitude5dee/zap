import type { ProviderPollResult } from "./provider-types";
import { AirVideoOutputError, persistAirVideoOutput } from "./blob-store";
import {
  recordAirVideoFailure,
  recordAirVideoAssetExpiry,
  releaseAirVideoConcurrency,
  scheduleAirVideoAssetCleanup,
  touchAirVideoConcurrency,
} from "./air-video-service";
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

  const url = new URL(`/providers/${provider}/webhook`, baseUrl);
  url.searchParams.set("runId", meta.runId);
  url.searchParams.set("stepId", meta.stepId);
  if (meta.capability) url.searchParams.set("capability", meta.capability);
  if (webhookSecret) {
    url.searchParams.set("secret", webhookSecret);
  }
  return url.toString();
}

export async function recordProviderWebhook(provider: ProviderWebhookProvider, payload: unknown, source: ProviderWebhookSource = {}) {
  const parsed = getProviderAdapter(provider).parseWebhook?.(payload, source.url) ?? parseProviderWebhook(payload, source.url);
  const redis = getRedis();
  if (redis) {
    // Do not turn this diagnostic queue into a second copy of provider input.
    // Webhook bodies and source URLs may carry prompts, signed media URLs, or
    // our callback secret. The execution path uses `parsed` in memory below;
    // Redis receives only an allowlisted audit summary.
    await redis.lpush(`zap:webhook:${provider}`, JSON.stringify(providerWebhookAuditRecord(provider, parsed)));
  }
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
  const isAirVideoRun = /^air_[a-f0-9]{24}$/.test(meta.runId);
  // Provider webhooks and polling are at-least-once. Never let a stale
  // queued/running callback regress a terminal artifact or trigger a second
  // Blob copy.
  if (existingStep && isTerminalStepStatus(existingStep.status)) {
    if (isAirVideoRun) await releaseAirVideoConcurrency(meta.runId);
    return {
      observed: true,
      provider,
      requestId: meta.requestId,
      runId: meta.runId,
      status: existingStep.status,
      stepId: meta.stepId,
    };
  }

  let effectiveResult = result;
  let storageKey: string | undefined;
  let airAssetExpiresAtMs: number | undefined;
  if (isAirVideoRun && result.status === "done") {
    if (!result.outputUrl) {
      effectiveResult = { ...result, error: "OUTPUT_MISSING", outputUrl: undefined, status: "failed" };
    } else if (!(await acquireAirOutputLease(meta.runId))) {
      // A second poll/webhook should retry after the first copier commits its
      // ledger record, rather than racing a deterministic Blob pathname.
      throw new Error("AIR_OUTPUT_PERSISTENCE_BUSY");
    } else {
      try {
        const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;
        const stored = await persistAirVideoOutput(result.outputUrl, `air/${meta.runId}/${meta.stepId}`, {
          // This durable queue write happens before Blob.put. A process crash
          // after the write therefore leaves a deletion plan for every object
          // that may have been created, instead of an orphaned public MP4.
          beforeBlobWrite: (plannedStorageKey) => scheduleAirVideoAssetCleanup(plannedStorageKey, expiresAtMs),
        });
        airAssetExpiresAtMs = expiresAtMs;
        effectiveResult = { ...result, outputUrl: stored.url };
        storageKey = stored.storageKey;
      } catch (error) {
        if (!(error instanceof AirVideoOutputError) || !error.deterministic) throw error;
        // Air never sends a provider URL directly. Only deterministic media
        // validation failures become a terminal generation failure.
        effectiveResult = { ...result, error: "OUTPUT_VALIDATION_FAILED", outputUrl: undefined, status: "failed" };
      }
    }
  }
  const status = effectiveResult.status === "failed" ? "failed" : effectiveResult.status === "done" ? "done" : effectiveResult.status === "queued" ? "queued" : "running";
  const progress = effectiveResult.progress ?? (status === "done" || status === "failed" ? 1 : status === "queued" ? 0 : 0.5);
  // Provider errors are untrusted text. Persisting it in Convex can retain a
  // prompt or signed first-frame URL long after the provider request expires.
  const ledgerError = status === "failed" ? persistedProviderFailureCode(effectiveResult.error) : undefined;

  // Air also mirrors terminal state in its private Redis record, so feed that
  // contract the same categorized value that reaches the generic ledger.
  if (isAirVideoRun && status === "failed") {
    await recordAirVideoFailure(meta.runId, ledgerError);
  }

  let assetId: string | undefined;
  // The asset is durable before the step is marked done. This leaves a retry
  // path if a process stops between Blob persistence and ledger completion.
  if (status === "done" && effectiveResult.outputUrl) {
    assetId = await addAssetLedger({
      kind: inferAssetKind(effectiveResult.outputUrl),
      parents: [],
      runId: meta.runId,
      stepId: meta.stepId,
      storageKey,
      url: effectiveResult.outputUrl,
    });
    if (isAirVideoRun && storageKey && airAssetExpiresAtMs) {
      // Cleanup was durably scheduled before Blob.put; persist the matching
      // public capability expiry before publishing the terminal step state.
      await recordAirVideoAssetExpiry(meta.runId, airAssetExpiresAtMs);
    }
  }

  await upsertStepLedger({
    actualUsd: effectiveResult.actualUsd ?? existingStep?.actualUsd,
    error: ledgerError,
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

  const nextSnapshot = await getRunSnapshot(meta.runId);
  const costUsd = nextSnapshot.steps.reduce((sum, step) => sum + (step.actualUsd ?? (step.status === "done" ? step.priceQuoteUsd : 0)), 0);
  const allStepsTerminal = nextSnapshot.steps.length > 0 && nextSnapshot.steps.every((step) => step.status === "done" || step.status === "skipped");
  const runStatus = status === "failed" ? "failed" : allStepsTerminal ? "done" : "running";
  await updateRunLedger({
    costUsd,
    error: ledgerError,
    runId: meta.runId,
    stage: status === "failed" ? `${meta.stepId}:failed` : allStepsTerminal ? "complete" : `${meta.stepId}:webhook_${status}`,
    status: runStatus,
    zapUrl: allStepsTerminal ? effectiveResult.outputUrl ?? nextSnapshot.run?.zapUrl : nextSnapshot.run?.zapUrl,
  });

  if (isAirVideoRun) {
    if (status === "done" || status === "failed") await releaseAirVideoConcurrency(meta.runId);
    else await touchAirVideoConcurrency(meta.runId);
  }

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

/**
 * A bounded webhook audit record. Keep raw payloads/source URLs out of Redis:
 * both can contain user prompts, first-frame capabilities, or callback
 * secrets. This queue is observational only; it is not used to replay work.
 */
function providerWebhookAuditRecord(provider: ProviderWebhookProvider, parsed: ProviderPollResult & ProviderProgressMeta) {
  const errorCode = parsed.status === "failed" ? persistedProviderFailureCode(parsed.error) : undefined;
  return {
    event: "provider_progress",
    hasOutput: Boolean(parsed.outputUrl),
    ...(typeof parsed.actualUsd === "number" && Number.isFinite(parsed.actualUsd) ? { actualUsd: parsed.actualUsd } : {}),
    ...(safeCapability(parsed.capability) ? { capability: parsed.capability } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(safeRunId(parsed.runId) ? { runId: parsed.runId } : {}),
    ...(safeStepId(parsed.stepId) ? { stepId: parsed.stepId } : {}),
    provider,
    status: parsed.status,
    ts: Date.now(),
  };
}

function safeCapability(value?: string) {
  return Boolean(value && /^(?:audio|image|video)\.[a-z_]+$/.test(value));
}

function safeRunId(value?: string) {
  return Boolean(value && /^(?:air_[a-f0-9]{24}|run_[A-Za-z0-9_-]{1,128})$/.test(value));
}

function safeStepId(value?: string) {
  return Boolean(value && /^[A-Za-z0-9:_-]{1,128}$/.test(value));
}

// This boundary must not trust a provider adapter to have already normalized
// diagnostics. Preserve only codes deliberately used by Zap; everything else
// becomes the generic category rather than durable provider text.
function persistedProviderFailureCode(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return persistedProviderFailureCodes.has(normalized) ? normalized : "PROVIDER_FAILED";
}

const persistedProviderFailureCodes = new Set([
  "ADMISSION_UNAVAILABLE",
  "CONCURRENCY_LIMIT",
  "DAILY_SPEND_CAP",
  "OUTPUT_MISSING",
  "OUTPUT_VALIDATION_FAILED",
  "PER_RUN_SPEND_CAP",
  "POLL_DEADLINE_EXCEEDED",
  "POLL_UNAVAILABLE",
  "PROVIDER_AUTH_FAILED",
  "PROVIDER_FAILED",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "SERVICE_CONFIGURATION",
  "SUBMISSION_PRECONDITION_FAILED",
  "SUBMISSION_UNAVAILABLE",
  "SUBMISSION_UNKNOWN",
  "VIDEO_EXPIRED",
]);

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
    ["outcome", "video_url"],
    ["outcome", "videoUrl"],
    ["outcome", "media_urls", "0", "url"],
    ["outcome", "media_urls", "0"],
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

function isTerminalStepStatus(status: string) {
  return status === "done" || status === "failed" || status === "skipped" || status === "canceled";
}

async function acquireAirOutputLease(runId: string) {
  const redis = getRedis();
  if (!redis) throw new Error("Air output persistence requires Redis.");
  const result = await redis.set(`zap:service:air:v1:output:${runId}`, "1", {
    ex: 120,
    nx: true,
  });
  return result === "OK";
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
