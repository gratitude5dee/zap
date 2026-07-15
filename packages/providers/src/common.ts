import { ProviderError } from "./errors.ts";
import type { ProviderPollResult, ProviderSecrets, ProviderWebhookResult } from "./types.ts";

export function requireSecret(secrets: ProviderSecrets | undefined, name: keyof ProviderSecrets, envName: string) {
  const value = secrets === undefined ? process.env[envName] : secrets[name];
  if (!value) {
    throw new ProviderError(`${envName} is required for live provider calls.`, {
      code: "KEY_MISSING",
      retryable: false,
    });
  }
  return value;
}

export async function readJsonResponse<T>(response: Response, provider: string): Promise<T> {
  const text = await response.text();
  const body = text ? tryJson(text) : {};
  if (!response.ok) {
    // Provider response bodies can echo prompts, signed media URLs, or other
    // user input. Keep those bodies in-process only; callers persist the
    // stable ProviderError code and safe HTTP status instead.
    throw new ProviderError(`${provider} request failed with HTTP ${response.status}.`, {
      code: response.status === 401 || response.status === 403 ? "KEY_INVALID" : response.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR",
      retryable: response.status === 429 || response.status >= 500,
      status: response.status,
    });
  }
  return body as T;
}

/**
 * Convert untrusted provider diagnostics into a small, persistence-safe
 * category. Never return the provider supplied text: APIs often echo prompts
 * and signed input/output URLs in their failure messages.
 */
export function providerFailureCode(value: unknown): string | undefined {
  const detail = typeof value === "string" ? value.trim() : "";
  if (!detail) return undefined;

  const normalized = detail.toUpperCase();
  if (knownProviderFailureCodes.has(normalized)) return normalized;
  if (/\b(401|403|api[ _-]?key|auth(?:entication|orization)?|credential|forbidden|unauthori[sz]ed)\b/i.test(detail)) {
    return "PROVIDER_AUTH_FAILED";
  }
  if (/\b(429|rate[ _-]?limit|quota|too many requests)\b/i.test(detail)) return "PROVIDER_RATE_LIMITED";
  if (/\b(408|5\d\d|connection|network|temporar(?:y|ily)|timeout|timed out|unavailable)\b/i.test(detail)) {
    return "PROVIDER_UNAVAILABLE";
  }
  if (/\b(400|404|409|422|cancel(?:led|ed)|canceled|invalid|moderation|policy|reject(?:ed|ion)?|unsupported)\b/i.test(detail)) {
    return "PROVIDER_REJECTED";
  }
  return "PROVIDER_FAILED";
}

const knownProviderFailureCodes = new Set([
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

export function normalizeStatus(status?: string | null): ProviderPollResult["status"] {
  const normalized = status?.toLowerCase();
  if (normalized === "complete" || normalized === "completed" || normalized === "succeeded" || normalized === "success" || normalized === "done") return "done";
  if (normalized === "failed" || normalized === "failure" || normalized === "error" || normalized === "errored" || normalized === "cancelled" || normalized === "canceled") return "failed";
  if (normalized === "running" || normalized === "processing" || normalized === "in_progress" || normalized === "progress" || normalized === "active") return "running";
  return "queued";
}

export function normalizeProgress(progress?: number) {
  if (progress === undefined || Number.isNaN(progress)) return undefined;
  if (progress > 1) return Math.max(0, Math.min(1, progress / 100));
  return Math.max(0, Math.min(1, progress));
}

export function extractUrl(value: unknown): string | undefined {
  return pickString(value, [
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
    ["result", "url"],
    ["result", "output_url"],
    ["result", "video_url"],
    ["data", "url"],
    ["data", "output_url"],
    ["data", "video_url"],
    ["data", "video", "url"],
    ["data", "audio", "url"],
    ["data", "image", "url"],
    ["data", "images", "0", "url"],
    ["payload", "url"],
    ["payload", "output_url"],
    ["images", "0", "url"],
    ["videos", "0", "url"],
  ]);
}

export function parseGenericWebhook(payload: unknown, sourceUrl?: string): ProviderWebhookResult {
  const query = readQuery(sourceUrl);
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
    error: providerFailureCode(pickString(payload, [["error"], ["error", "message"], ["data", "error"], ["payload", "error"]])),
    outputUrl: extractUrl(payload),
    progress: normalizeProgress(pickNumber(payload, [["progress"], ["percentage"], ["percent"], ["data", "progress"], ["payload", "progress"]])),
    requestId: query.get("requestId") ?? pickString(payload, [
      ["request_id"],
      ["requestId"],
      ["id"],
      ["data", "request_id"],
      ["data", "requestId"],
      ["data", "id"],
      ["payload", "request_id"],
      ["payload", "requestId"],
    ]),
    runId: query.get("runId") ?? pickString(payload, [["runId"], ["run_id"], ["metadata", "runId"], ["metadata", "run_id"]]),
    status,
    stepId: query.get("stepId") ?? pickString(payload, [["stepId"], ["step_id"], ["metadata", "stepId"], ["metadata", "step_id"]]),
  };
}

export function pickString(value: unknown, paths: string[][]) {
  for (const path of paths) {
    const picked = pick(value, path);
    if (typeof picked === "string" && picked.length > 0) return picked;
    if (typeof picked === "number" && Number.isFinite(picked)) return String(picked);
  }
  return undefined;
}

export function pickNumber(value: unknown, paths: string[][]) {
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
    if (typeof current === "object" && current !== null) return (current as Record<string, unknown>)[segment];
    return undefined;
  }, value);
}

function readQuery(sourceUrl?: string) {
  if (!sourceUrl) return new URLSearchParams();
  try {
    return new URL(sourceUrl).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function tryJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
