import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { deletePersistedAsset, hasAirBlobCredentials } from "./blob-store";
import { submitGeneration } from "./providers/router";
import { getRedis } from "./redis";
import { createRunLedger, getRunSnapshot, redactAirVideoAsset, updateRunLedger, upsertStepLedger } from "./run-ledger";

/**
 * Private service boundary used by Air's iMessage worker.  It deliberately
 * stores no prompts, inbound attachment identifiers, or plaintext signed
 * upload URLs (short-lived ticket replay state is AES-GCM encrypted).
 * Air keeps the user-facing durable state; Zap owns provider submission,
 * polling, spend reservation, and its short-lived generated artifact.
 */
export const AIR_VIDEO_MODEL = "seedance-2-0-fast-260128";
export const AIR_VIDEO_DURATION_SECONDS = 5;
export const AIR_VIDEO_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const AIR_VIDEO_MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

const GMI_QUEUE_URL = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey";
const GMI_UPLOAD_URL = `${GMI_QUEUE_URL}/upload-url`;
const AIR_REDIS_PREFIX = "zap:service:air:v1";
const AIR_GENERATE_STEP_ID = "seedance";
const AIR_RECORD_TTL_SECONDS = 60 * 60 * 24 * 7;
const AIR_ACTIVE_KEY = `${AIR_REDIS_PREFIX}:active`;
const AIR_SUBMISSION_LEASE_TTL_MS = 90_000;
const AIR_ASSET_CLEANUP_KEY = `${AIR_REDIS_PREFIX}:asset-cleanup`;
const AIR_ASSET_TTL_MS = 24 * 60 * 60 * 1000;
// Cleanup is intentionally lease-based rather than a destructive queue pop.
// The scheduled ZSET remains the source of truth until Blob confirms deletion,
// so a process dying between selection and deletion cannot orphan an MP4.
const AIR_ASSET_CLEANUP_LEASE_PREFIX = `${AIR_REDIS_PREFIX}:asset-cleanup-lease`;
const AIR_ASSET_CLEANUP_LEASE_MS = 5 * 60 * 1000;
const AIR_ASSET_CLEANUP_RETRY_DELAY_MS = 10 * 60 * 1000;
const AIR_UPLOAD_TICKET_TTL_MS = 15 * 60 * 1000;
const AIR_UPLOAD_TICKET_PENDING_TTL_MS = 30 * 1000;
const AIR_UPLOAD_TICKET_FETCH_TIMEOUT_MS = 20 * 1000;
const AIR_UPLOAD_TICKET_AAD = Buffer.from("zap:service:air:v1:upload-ticket");

const uploadInputSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png"]),
  sizeBytes: z.number().int().positive().max(AIR_VIDEO_MAX_IMAGE_BYTES),
});

const submitInputSchema = z.object({
  firstFrameUrl: z.string().url().max(8_192).optional(),
  prompt: z.string().trim().min(1).max(2_000),
});

const runStatusSchema = z.enum([
  "validated",
  "submission_unknown",
  "queued",
  "running",
  "video_ready",
  "retryable",
  "dead_letter",
]);

const runRecordSchema = z.object({
  createdAt: z.number().int(),
  errorCode: z.string().optional(),
  estimatedUsd: z.number().nonnegative(),
  firstFrameDigest: z.string().optional(),
  hasFirstFrame: z.boolean(),
  promptDigest: z.string(),
  providerRequestId: z.string().optional(),
  runId: z.string(),
  status: runStatusSchema,
  updatedAt: z.number().int(),
  // The Blob cleanup queue owns the actual deletion. This timestamp is the
  // matching capability-expiry advertised to Air, never a provider URL TTL.
  videoExpiresAtMs: z.number().int().positive().optional(),
});

export type AirVideoRunStatus = z.infer<typeof runStatusSchema>;
export type AirVideoRunRecord = z.infer<typeof runRecordSchema>;
export type AirUploadInput = z.infer<typeof uploadInputSchema>;
export type AirVideoSubmitInput = z.infer<typeof submitInputSchema>;

export type AirUploadTicket = {
  expiresAt: string;
  headers: { "content-type": "image/jpeg" | "image/png" };
  method: "PUT";
  publicUrl: string;
  uploadUrl: string;
};

type CachedAirUploadTicket = {
  expiresAtMs: number;
  inputDigest: string;
  schemaVersion: 1;
  ticket: AirUploadTicket;
};

export type AirVideoRunResponse = {
  /** Stable, sanitized code for a failed/uncertain Air run; never provider text. */
  errorCode?: string;
  estimatedUsd: number;
  /** Integer percent (0–100), safe to render in the iMessage worker. */
  progress: number;
  replayed?: boolean;
  retryable: boolean;
  runId: string;
  status: AirVideoRunStatus;
  video?: {
    expiresAt: string;
    mimeType: "video/mp4";
    url: string;
  };
};

export class AirVideoServiceError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(code: string, status: number, retryable: boolean) {
    super(code);
    this.name = "AirVideoServiceError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

export function isAirServiceAuthorized(request: Request) {
  const token = process.env.ZAP_AIR_SERVICE_TOKEN?.trim();
  if (!token) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function parseAirUploadInput(input: unknown): AirUploadInput {
  return parseInput(uploadInputSchema, input);
}

export function parseAirVideoSubmitInput(input: unknown): AirVideoSubmitInput {
  const parsed = parseInput(submitInputSchema, input);
  if (parsed.firstFrameUrl && !isAllowedFirstFrameUrl(parsed.firstFrameUrl)) {
    throw new AirVideoServiceError("INVALID_FIRST_FRAME_URL", 400, false);
  }
  return parsed;
}

export function validateAirServiceIdempotencyKey(value: string) {
  assertIdempotencyKey(value);
}

/** Obtain a GMI signed URL. Air uploads directly to it; Zap never receives bytes. */
export async function createAirUploadTicket(input: AirUploadInput, idempotencyKey: string): Promise<AirUploadTicket> {
  assertIdempotencyKey(idempotencyKey);
  const redis = requireAirUploadTicketRuntime();
  const inputDigest = digest(`upload-input:${JSON.stringify({ mimeType: input.mimeType, sizeBytes: input.sizeBytes })}`);
  const ticketKey = airUploadTicketKey(idempotencyKey);
  const pendingKey = airUploadTicketPendingKey(idempotencyKey);
  const now = Date.now();

  const cached = await readCachedAirUploadTicket(redis, ticketKey);
  if (cached) {
    assertMatchingUploadTicketInput(cached, inputDigest);
    if (cached.expiresAtMs > now + 5_000) return cached.ticket;
  }

  // GMI's upload URL is a bearer capability rather than an idempotent API
  // result. This lease bounds the one external request that can mint it. A
  // caller that loses the race must retry rather than mint a second URL.
  const pending = await redis.set(pendingKey, inputDigest, {
    nx: true,
    px: AIR_UPLOAD_TICKET_PENDING_TTL_MS,
  });
  if (pending !== "OK") {
    const pendingInput = await redis.get<unknown>(pendingKey);
    if (typeof pendingInput === "string") assertMatchingUploadTicketDigest(pendingInput, inputDigest);
    if (pendingInput !== null && pendingInput !== undefined && typeof pendingInput !== "string") {
      throw new AirVideoServiceError("UPLOAD_TICKET_CACHE_INVALID", 503, true);
    }
    const raced = await readCachedAirUploadTicket(redis, ticketKey);
    if (raced) {
      assertMatchingUploadTicketInput(raced, inputDigest);
      if (raced.expiresAtMs > Date.now() + 5_000) return raced.ticket;
    }
    throw new AirVideoServiceError("UPLOAD_TICKET_PENDING", 503, true);
  }

  let response: Response;
  try {
    response = await fetch(GMI_UPLOAD_URL, {
      body: JSON.stringify({ file_type: input.mimeType === "image/png" ? "png" : "jpeg" }),
      headers: gmiHeaders(),
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(AIR_UPLOAD_TICKET_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new AirVideoServiceError("UPLOAD_TICKET_UNAVAILABLE", 503, true);
  }
  const body = await readJson(response);
  if (!response.ok) {
    throw new AirVideoServiceError("UPLOAD_TICKET_UNAVAILABLE", response.status === 429 || response.status >= 500 ? 503 : 502, true);
  }

  const uploadUrl = readString(body, [["upload_url"], ["data", "upload_url"]]);
  const publicUrl = readString(body, [["public_url"], ["data", "public_url"]]);
  if (!uploadUrl || !publicUrl || !isAllowedGmiUploadUrl(uploadUrl) || !isAllowedFirstFrameUrl(publicUrl)) {
    throw new AirVideoServiceError("UPLOAD_TICKET_INVALID", 502, true);
  }

  const expiresAtMs = Date.now() + AIR_UPLOAD_TICKET_TTL_MS;
  const ticket: AirUploadTicket = {
    expiresAt: new Date(expiresAtMs).toISOString(),
    headers: { "content-type": input.mimeType },
    method: "PUT",
    publicUrl,
    uploadUrl,
  };
  const encrypted = encryptAirUploadTicket({
    expiresAtMs,
    inputDigest,
    schemaVersion: 1,
    ticket,
  });
  await redis.set(ticketKey, encrypted, { px: Math.max(1, expiresAtMs - Date.now()) });
  return ticket;
}

/**
 * Submit exactly one fixed-cost Seedance job. The idempotency record is
 * committed before the provider call. If execution crashes after the call has
 * begun, the only safe recovery state is submission_unknown; it is never
 * automatically re-submitted.
 */
export async function submitAirVideoRun(input: AirVideoSubmitInput, idempotencyKey: string): Promise<AirVideoRunResponse> {
  assertIdempotencyKey(idempotencyKey);
  requireAirGenerationRuntime();
  const redis = requireRedis();
  const estimatedUsd = getVerifiedAirPrice();
  const runId = airRunId(idempotencyKey);
  const idemStorageKey = airIdempotencyKey(idempotencyKey);
  const now = Date.now();
  const baseRecord: AirVideoRunRecord = {
    createdAt: now,
    estimatedUsd,
    ...(input.firstFrameUrl ? { firstFrameDigest: digest(`frame:${input.firstFrameUrl}`) } : {}),
    hasFirstFrame: Boolean(input.firstFrameUrl),
    promptDigest: digest(input.prompt),
    runId,
    status: "validated",
    updatedAt: now,
  };

  // One script commits both the replay mapping and the pre-submission intent.
  // A process crash can therefore leave a recoverable `validated` record, but
  // never a replay key that points to a missing run record.
  const created = await claimAirRun(redis, idemStorageKey, baseRecord);
  const prior = created ? baseRecord : await getAirRunRecord(runId);
  if (!prior) throw new AirVideoServiceError("IDEMPOTENCY_PENDING", 503, true);
  assertMatchingAirRequest(prior, baseRecord);

  if (prior.status !== "validated" && prior.status !== "retryable") {
    return { ...(await getAirVideoRun(runId)), replayed: true };
  }

  // A restarted invocation may resume only a durable pre-submission intent.
  // It cannot take over once `submission_unknown` has been persisted.
  if (!(await acquireAirSubmissionLease(redis, runId))) {
    throw new AirVideoServiceError("IDEMPOTENCY_PENDING", 503, true);
  }

  const current = await getAirRunRecord(runId);
  if (!current) throw new AirVideoServiceError("IDEMPOTENCY_PENDING", 503, true);
  assertMatchingAirRequest(current, baseRecord);
  if (current.status !== "validated" && current.status !== "retryable") {
    return { ...(await getAirVideoRun(runId)), replayed: true };
  }

  let providerSubmissionStarted = false;
  let admission: "new" | "existing" | null = null;

  try {
    await saveAirRunRecord(baseRecord);
    await createRunLedger({
      credentialMode: "byok",
      inputs: {
        hasFirstFrame: Boolean(input.firstFrameUrl),
        promptDigest: baseRecord.promptDigest,
        service: "air-imessage-video",
      },
      runId,
      zapSlug: "air-imessage-video",
      zapVersion: 1,
    });
    await upsertStepLedger({
      kind: "video.gen",
      model: AIR_VIDEO_MODEL,
      priceQuoteUsd: estimatedUsd,
      progress: 0,
      provider: "gmi",
      runId,
      status: "queued",
      stepId: AIR_GENERATE_STEP_ID,
    });
    await updateRunLedger({ costUsd: 0, runId, stage: "validated", status: "queued" });

    admission = await reserveAirAdmission(runId, estimatedUsd);

    // Persist before touching GMI. A timeout after this point is ambiguous.
    const submitting: AirVideoRunRecord = {
      ...current,
      status: "submission_unknown",
      updatedAt: Date.now(),
    };
    await saveAirRunRecord(submitting);
    providerSubmissionStarted = true;
    const submitted = await submitGeneration({
      capability: "video.gen",
      durationS: AIR_VIDEO_DURATION_SECONDS,
      inputs: input.firstFrameUrl ? { firstFrameUrl: input.firstFrameUrl } : {},
      model: AIR_VIDEO_MODEL,
      prompt: input.prompt,
      provider: "gmi",
      runId,
      stepId: AIR_GENERATE_STEP_ID,
    });

    // Queue receipt is the recovery boundary. Persist it before any ledger
    // bookkeeping so a later transient failure cannot strand a known GMI job
    // in submission_unknown.
    const queued = {
      ...submitting,
      providerRequestId: submitted.requestId,
      status: "queued" as const,
      updatedAt: Date.now(),
    };
    await saveAirRunRecord(queued);

    await upsertStepLedger({
      idemKey: submitted.idemKey,
      kind: "video.gen",
      model: AIR_VIDEO_MODEL,
      priceQuoteUsd: estimatedUsd,
      progress: 0,
      provider: submitted.provider,
      providerRequestId: submitted.requestId,
      runId,
      status: "queued",
      stepId: AIR_GENERATE_STEP_ID,
    });
    await updateRunLedger({ costUsd: 0, runId, stage: "queued", status: "queued" });
    return replayResponse(responseForRecord(queued), !created);
  } catch (error) {
    if (providerSubmissionStarted) {
      if (isDefinitiveProviderRejection(error)) {
        if (admission) await releaseAirAdmission(runId, estimatedUsd).catch(() => undefined);
        const rejected = {
          ...current,
          errorCode: "PROVIDER_REJECTED",
          status: "dead_letter" as const,
          updatedAt: Date.now(),
        };
        await saveAirRunRecord(rejected).catch(() => undefined);
        await updateRunLedger({ costUsd: 0, error: rejected.errorCode, runId, stage: "rejected", status: "failed" }).catch(() => undefined);
        return replayResponse(responseForRecord(rejected), !created);
      }
      // The provider may have accepted a request even if the response vanished.
      // Keep the active slot and daily reservation until terminal recovery.
      const uncertain = {
        ...current,
        errorCode: "SUBMISSION_UNKNOWN",
        status: "submission_unknown" as const,
        updatedAt: Date.now(),
      };
      await saveAirRunRecord(uncertain).catch(() => undefined);
      return replayResponse(responseForRecord(uncertain), !created);
    }

    if (admission === "new") await releaseAirAdmission(runId, estimatedUsd).catch(() => undefined);
    const retryable = error instanceof AirVideoServiceError ? error.retryable : true;
    const retryRecord = {
      ...current,
      errorCode: error instanceof AirVideoServiceError ? error.code : "SUBMISSION_PRECONDITION_FAILED",
      status: "retryable" as const,
      updatedAt: Date.now(),
    };
    await saveAirRunRecord(retryRecord).catch(() => undefined);
    await updateRunLedger({ costUsd: 0, error: retryRecord.errorCode, runId, stage: "retryable", status: "failed" }).catch(() => undefined);
    if (error instanceof AirVideoServiceError) throw error;
    throw new AirVideoServiceError("SUBMISSION_UNAVAILABLE", 503, retryable);
  }
}

export async function getAirVideoRun(runId: string): Promise<AirVideoRunResponse> {
  if (!/^air_[a-f0-9]{24}$/.test(runId)) throw new AirVideoServiceError("RUN_NOT_FOUND", 404, false);
  const record = await getAirRunRecord(runId);
  if (!record) throw new AirVideoServiceError("RUN_NOT_FOUND", 404, false);

  const snapshot = await getRunSnapshot(runId);
  const response = responseFromSnapshot(record, snapshot);
  if (response.status !== record.status || (response.errorCode && response.errorCode !== record.errorCode)) {
    await saveAirRunRecord({
      ...record,
      ...(response.errorCode ? { errorCode: response.errorCode } : {}),
      status: response.status,
      updatedAt: Date.now(),
    });
  }
  if (response.status === "video_ready" || response.status === "dead_letter") {
    await releaseAirVideoConcurrency(runId).catch(() => undefined);
  }
  return response;
}

/** Persist a whitelisted failure code for Air without ever storing provider text. */
export async function recordAirVideoFailure(runId: string, errorCode?: string) {
  if (!/^air_[a-f0-9]{24}$/.test(runId)) return;
  const record = await getAirRunRecord(runId);
  if (!record || record.status === "video_ready") return;
  const stableErrorCode = sanitizeAirErrorCode(errorCode) ?? "PROVIDER_FAILED";
  if (record.status === "dead_letter" && record.errorCode === stableErrorCode) return;
  await saveAirRunRecord({
    ...record,
    errorCode: stableErrorCode,
    status: "dead_letter",
    updatedAt: Date.now(),
  });
}

/** Called by the poller/webhook path as soon as a provider result becomes terminal. */
export async function releaseAirVideoConcurrency(runId: string) {
  if (!/^air_[a-f0-9]{24}$/.test(runId)) return;
  const redis = getRedis();
  if (!redis) return;
  await redis.zrem(AIR_ACTIVE_KEY, runId);
}

/** Renew a job lease while a provider remains queued/running. */
export async function touchAirVideoConcurrency(runId: string) {
  if (!/^air_[a-f0-9]{24}$/.test(runId)) return;
  const redis = getRedis();
  if (!redis) return;
  await redis.zadd(AIR_ACTIVE_KEY, { member: runId, score: Date.now() });
}

/** Keep generated MP4s available long enough for iMessage delivery, then remove them. */
export async function scheduleAirVideoAssetCleanup(storageKey: string, expiresAtMs = Date.now() + AIR_ASSET_TTL_MS) {
  if (!storageKey) throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
  // A Blob write is now conditional on this record. Never silently skip the
  // schedule when Redis is absent, or a crash can leave a public MP4 orphaned.
  const redis = requireRedis();
  const expiresAt = Math.max(Date.now() + 1_000, Math.floor(expiresAtMs));
  await redis.zadd(AIR_ASSET_CLEANUP_KEY, { member: storageKey, score: expiresAt });
  // Earlier releases applied a 48h key TTL. Clear it whenever a new entry is
  // scheduled so an extended cron outage cannot erase the only deletion plan.
  await redis.persist(AIR_ASSET_CLEANUP_KEY);
}

/**
 * Records the same expiry used by the Blob cleanup queue. The public Air API
 * can therefore tell its worker when a temporary MP4 URL must no longer be
 * used, without exposing a storage key or provider output URL.
 */
export async function recordAirVideoAssetExpiry(runId: string, expiresAtMs: number) {
  if (!/^air_[a-f0-9]{24}$/.test(runId) || !Number.isInteger(expiresAtMs) || expiresAtMs <= Date.now()) return;
  const record = await getAirRunRecord(runId);
  if (!record || record.videoExpiresAtMs === expiresAtMs) return;
  await saveAirRunRecord({ ...record, updatedAt: Date.now(), videoExpiresAtMs: expiresAtMs });
}

/** Invoked by the existing protected provider-poller cron. */
export async function cleanupExpiredAirVideoAssets(limit = 10) {
  const redis = getRedis();
  if (!redis) return 0;
  const storageKeys = await redis.zrange<string[]>(
    AIR_ASSET_CLEANUP_KEY,
    "-inf",
    Date.now(),
    { byScore: true, count: Math.max(1, Math.min(limit, 50)), offset: 0 },
  );
  for (const storageKey of storageKeys) {
    const leaseToken = randomBytes(18).toString("base64url");
    if (!(await acquireAirVideoCleanupLease(redis, storageKey, leaseToken))) continue;
    try {
      await deletePersistedAsset(storageKey);
      const runId = airRunIdFromStorageKey(storageKey);
      if (runId) {
        await redactAirVideoAsset({ runId, storageKey });
        const record = await getAirRunRecord(runId);
        if (record && record.status === "video_ready") {
          await saveAirRunRecord({
            ...record,
            errorCode: "VIDEO_EXPIRED",
            status: "dead_letter",
            updatedAt: Date.now(),
          });
        }
      }
      // A deletion is acknowledged only if this worker still owns the lease.
      // If its lease expired while Blob was slow, leave the schedule in place:
      // another worker can safely repeat an idempotent delete and acknowledge.
      await acknowledgeAirVideoCleanup(redis, storageKey, leaseToken);
    } catch {
      // Preserve the primary schedule before releasing the per-object lease.
      // If either operation is interrupted, the untouched due member and the
      // expiring lease still make the work recoverable on a later cron pass.
      await redis.zadd(AIR_ASSET_CLEANUP_KEY, {
        member: storageKey,
        score: Date.now() + AIR_ASSET_CLEANUP_RETRY_DELAY_MS,
      });
      await releaseAirVideoCleanupLease(redis, storageKey, leaseToken);
    }
  }
  return storageKeys.length;
}

async function acquireAirVideoCleanupLease(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  storageKey: string,
  leaseToken: string,
) {
  const claimed = await redis.set(airVideoCleanupLeaseKey(storageKey), leaseToken, {
    nx: true,
    px: AIR_ASSET_CLEANUP_LEASE_MS,
  });
  return claimed === "OK";
}

/** Remove the schedule only after Blob confirms deletion and only for its owner. */
async function acknowledgeAirVideoCleanup(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  storageKey: string,
  leaseToken: string,
) {
  const script = redis.createScript<number>([
    "if redis.call('GET', KEYS[2]) ~= ARGV[1] then return 0 end",
    "redis.call('ZREM', KEYS[1], ARGV[2])",
    "return redis.call('DEL', KEYS[2])",
  ].join("\n"));
  return (await script.eval(
    [AIR_ASSET_CLEANUP_KEY, airVideoCleanupLeaseKey(storageKey)],
    [leaseToken, storageKey],
  )) === 1;
}

/** Never clear a successor's lease when an earlier attempt fails. */
async function releaseAirVideoCleanupLease(
  redis: NonNullable<ReturnType<typeof getRedis>>,
  storageKey: string,
  leaseToken: string,
) {
  const script = redis.createScript<number>([
    "if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end",
    "return redis.call('DEL', KEYS[1])",
  ].join("\n"));
  return (await script.eval([airVideoCleanupLeaseKey(storageKey)], [leaseToken])) === 1;
}

function airVideoCleanupLeaseKey(storageKey: string) {
  return `${AIR_ASSET_CLEANUP_LEASE_PREFIX}:${createHash("sha256").update(storageKey).digest("hex")}`;
}

function airRunIdFromStorageKey(storageKey: string) {
  const match = /^air\/(air_[a-f0-9]{24})\//.exec(storageKey);
  return match?.[1];
}

function responseFromSnapshot(record: AirVideoRunRecord, snapshot: Awaited<ReturnType<typeof getRunSnapshot>>): AirVideoRunResponse {
  const step = snapshot.steps.find((candidate) => candidate.stepId === AIR_GENERATE_STEP_ID);
  const video = snapshot.assets.find((asset) => asset.stepId === AIR_GENERATE_STEP_ID && asset.kind === "mp4");
  let status = record.status;

  // Do not convert an ambiguous handoff to a resubmittable state until a
  // durable provider request id has been recorded.
  if (record.status !== "dead_letter" && record.status !== "video_ready" && !(record.status === "submission_unknown" && !step?.providerRequestId)) {
    if (snapshot.run?.status === "failed" || snapshot.run?.status === "canceled" || step?.status === "failed" || step?.status === "canceled") {
      status = "dead_letter";
    } else if (snapshot.run?.status === "done" || step?.status === "done") {
      status = video ? "video_ready" : "dead_letter";
    } else if (step?.status === "running" || snapshot.run?.status === "running") {
      status = "running";
    } else if (step?.status === "queued" || snapshot.run?.status === "queued") {
      status = "queued";
    }
  }

  const publicStatus = status === "validated" ? "retryable" : status;
  const errorCode = publicAirErrorCode({ record, snapshot, status: publicStatus, video: Boolean(video) });
  return {
    ...(errorCode ? { errorCode } : {}),
    estimatedUsd: record.estimatedUsd,
    progress: publicAirProgress(publicStatus, step?.progress),
    // An ambiguous GMI handoff must be surfaced for operator reconciliation,
    // never as a signal for Air to automatically submit again.
    retryable: status === "retryable" || status === "validated",
    runId: record.runId,
    status: publicStatus,
    ...(publicStatus === "video_ready" && video
      ? {
          video: {
            // Old records from before this field was introduced retain a
            // conservative expiry anchored to the run creation time.
            expiresAt: new Date(record.videoExpiresAtMs ?? record.createdAt + AIR_ASSET_TTL_MS).toISOString(),
            mimeType: "video/mp4" as const,
            url: video.url,
          },
        }
      : {}),
  };
}

function responseForRecord(record: AirVideoRunRecord): AirVideoRunResponse {
  const status = record.status === "validated" ? "retryable" : record.status;
  const errorCode = publicAirErrorCode({ record, status, video: false });
  return {
    ...(errorCode ? { errorCode } : {}),
    estimatedUsd: record.estimatedUsd,
    progress: publicAirProgress(status),
    retryable: status === "retryable",
    runId: record.runId,
    status,
  };
}

function publicAirProgress(status: AirVideoRunStatus, value?: number) {
  if (status === "video_ready" || status === "dead_letter") return 100;
  const fallback = status === "running" ? 50 : 0;
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  // A non-terminal provider callback cannot advertise a finished Air video.
  const percent = value > 1 ? value : value * 100;
  return Math.min(99, Math.max(0, Math.round(percent)));
}

function publicAirErrorCode({
  record,
  snapshot,
  status,
  video,
}: {
  record: AirVideoRunRecord;
  snapshot?: Awaited<ReturnType<typeof getRunSnapshot>>;
  status: AirVideoRunStatus;
  video: boolean;
}) {
  if (status === "submission_unknown") return sanitizeAirErrorCode(record.errorCode) ?? "SUBMISSION_UNKNOWN";
  if (status === "retryable") return sanitizeAirErrorCode(record.errorCode) ?? "SUBMISSION_UNAVAILABLE";
  if (status !== "dead_letter") return undefined;
  if (sanitizeAirErrorCode(record.errorCode)) return sanitizeAirErrorCode(record.errorCode);
  const step = snapshot?.steps.find((candidate) => candidate.stepId === AIR_GENERATE_STEP_ID);
  if ((snapshot?.run?.status === "done" || step?.status === "done") && !video) return "OUTPUT_MISSING";
  return "PROVIDER_FAILED";
}

function sanitizeAirErrorCode(value?: string) {
  return value && airErrorCodes.has(value) ? value : undefined;
}

const airErrorCodes = new Set([
  "ADMISSION_UNAVAILABLE",
  "CONCURRENCY_LIMIT",
  "DAILY_SPEND_CAP",
  "OUTPUT_MISSING",
  "OUTPUT_VALIDATION_FAILED",
  "PER_RUN_SPEND_CAP",
  "POLL_DEADLINE_EXCEEDED",
  "POLL_UNAVAILABLE",
  "PROVIDER_FAILED",
  "PROVIDER_REJECTED",
  "SERVICE_CONFIGURATION",
  "SUBMISSION_PRECONDITION_FAILED",
  "SUBMISSION_UNAVAILABLE",
  "SUBMISSION_UNKNOWN",
  "VIDEO_EXPIRED",
]);

function replayResponse(response: AirVideoRunResponse, replayed: boolean) {
  return replayed ? { ...response, replayed: true } : response;
}

async function getAirRunRecord(runId: string) {
  const redis = requireRedis();
  const stored = await redis.get<unknown>(airRunRecordKey(runId));
  const value = typeof stored === "string" ? tryJson(stored) : stored;
  const parsed = runRecordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function saveAirRunRecord(record: AirVideoRunRecord) {
  const redis = requireRedis();
  await redis.set(airRunRecordKey(record.runId), record, { ex: AIR_RECORD_TTL_SECONDS });
}

/** Atomically publish the idempotency mapping and its redacted intent record. */
async function claimAirRun(
  redis: ReturnType<typeof requireRedis>,
  idempotencyStorageKey: string,
  record: AirVideoRunRecord,
): Promise<boolean> {
  const script = redis.createScript<number>([
    "if redis.call('TYPE', KEYS[1]).ok ~= 'none' and redis.call('TYPE', KEYS[1]).ok ~= 'string' then return -1 end",
    "if redis.call('TYPE', KEYS[2]).ok ~= 'none' and redis.call('TYPE', KEYS[2]).ok ~= 'string' then return -1 end",
    "local existing = redis.call('GET', KEYS[1])",
    "if existing then return 0 end",
    "if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end",
    "redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])",
    "redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[2])",
    "return 1",
  ].join("\n"));
  const result = await script.eval(
    [idempotencyStorageKey, airRunRecordKey(record.runId)],
    [record.runId, String(AIR_RECORD_TTL_SECONDS), JSON.stringify(record)],
  );
  if (result === 1) return true;
  if (result === 0) return false;
  throw new AirVideoServiceError("IDEMPOTENCY_UNAVAILABLE", 503, true);
}

/** A short execution lease makes a validated crash intent safe to resume once. */
async function acquireAirSubmissionLease(redis: ReturnType<typeof requireRedis>, runId: string): Promise<boolean> {
  const claimed = await redis.set(`${AIR_REDIS_PREFIX}:submission:${runId}`, "1", {
    nx: true,
    px: AIR_SUBMISSION_LEASE_TTL_MS,
  });
  return claimed === "OK";
}

function assertMatchingAirRequest(existing: AirVideoRunRecord, expected: AirVideoRunRecord) {
  if (
    existing.estimatedUsd !== expected.estimatedUsd
    || existing.hasFirstFrame !== expected.hasFirstFrame
    || existing.firstFrameDigest !== expected.firstFrameDigest
    || existing.promptDigest !== expected.promptDigest
  ) {
    throw new AirVideoServiceError("IDEMPOTENCY_CONFLICT", 409, false);
  }
}

/**
 * Reserve both cost and the global work slot in one Redis transaction. An
 * unknown submission intentionally has no TTL: it must be reconciled by an
 * operator, not silently released into a possible third provider job.
 */
async function reserveAirAdmission(runId: string, amount: number): Promise<"new" | "existing"> {
  const redis = requireRedis();
  const limit = Math.min(readPositiveInteger("ZAP_AIR_CONCURRENCY_LIMIT", 2), 2);
  const cap = readPositiveNumber("ZAP_AIR_DAILY_CAP_USD", process.env.NODE_ENV === "production" ? undefined : 5);
  const { key: spendKey, ttlSeconds } = todaySpendKey();
  const script = redis.createScript<number>([
    "local current = tonumber(redis.call('GET', KEYS[2]) or '0')",
    "local amount = tonumber(ARGV[1])",
    "local cap = tonumber(ARGV[2])",
    "local limit = tonumber(ARGV[3])",
    "local member = ARGV[4]",
    "if redis.call('ZSCORE', KEYS[1], member) then return 2 end",
    "if redis.call('ZCARD', KEYS[1]) >= limit then return 0 end",
    "if current + amount > cap then return -1 end",
    "redis.call('ZADD', KEYS[1], tonumber(ARGV[5]), member)",
    "redis.call('SET', KEYS[2], tostring(current + amount), 'EX', ARGV[6])",
    "return 1",
  ].join("\n"));
  const result = await script.eval(
    [AIR_ACTIVE_KEY, spendKey],
    [String(amount), String(cap), String(limit), runId, String(Date.now()), String(ttlSeconds)],
  );
  if (result === 0) throw new AirVideoServiceError("CONCURRENCY_LIMIT", 429, true);
  if (result === -1) throw new AirVideoServiceError("DAILY_SPEND_CAP", 429, true);
  if (result !== 1 && result !== 2) throw new AirVideoServiceError("ADMISSION_UNAVAILABLE", 503, true);
  return result === 1 ? "new" : "existing";
}

/** Return a pre-provider admission only when this invocation created it. */
async function releaseAirAdmission(runId: string, amount: number) {
  const redis = requireRedis();
  const { key: spendKey, ttlSeconds } = todaySpendKey();
  const script = redis.createScript<number>([
    "local removed = redis.call('ZREM', KEYS[1], ARGV[1])",
    "if removed ~= 1 then return 0 end",
    "local current = tonumber(redis.call('GET', KEYS[2]) or '0')",
    "local next = math.max(0, current - tonumber(ARGV[2]))",
    "redis.call('SET', KEYS[2], tostring(next), 'EX', ARGV[3])",
    "return 1",
  ].join("\n"));
  await script.eval([AIR_ACTIVE_KEY, spendKey], [runId, String(amount), String(ttlSeconds)]);
}

function todaySpendKey() {
  const now = new Date();
  const key = `${AIR_REDIS_PREFIX}:spend:${now.toISOString().slice(0, 10)}`;
  const ttlSeconds = Math.max(60, Math.ceil((Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  ) - Date.now()) / 1000));
  return { key, ttlSeconds };
}

function requireAirGenerationRuntime() {
  requireGmiApiKey();
  requireRedis();
  if (process.env.NODE_ENV === "production") {
    if (!hasAirBlobCredentials()) {
      throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
    }
    for (const name of [
      "CONVEX_URL",
      "ZAP_AIR_IDEMPOTENCY_HMAC_SECRET",
      "ZAP_CONVEX_SERVICE_TOKEN",
    ] as const) {
      if (!process.env[name]?.trim()) throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
    }
  }
}

/** Upload tickets contain a bearer signed URL, so the Redis cache is always encrypted. */
function requireAirUploadTicketRuntime() {
  requireGmiApiKey();
  const redis = requireRedis();
  uploadTicketEncryptionKey();
  // Ticket keys and their request fingerprints are HMAC-derived. Require the
  // same root secret explicitly so an upload route can never fall back to a
  // reversible or plaintext Redis key in a partially configured deployment.
  if (!process.env.ZAP_AIR_IDEMPOTENCY_HMAC_SECRET?.trim()) {
    throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
  }
  return redis;
}

function requireGmiApiKey() {
  if (!process.env.GMI_API_KEY?.trim()) throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
}

function requireRedis() {
  const redis = getRedis();
  if (!redis) throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
  return redis;
}

function getVerifiedAirPrice() {
  // The provider's public pricing can change. Production is intentionally
  // disabled until an operator sets this value from GMI's current price page.
  const rate = readPositiveNumber("GMI_SEEDANCE_FAST_USD_PER_SECOND");
  const estimated = Number((rate * AIR_VIDEO_DURATION_SECONDS).toFixed(6));
  const perRunCap = readPositiveNumber(
    "ZAP_AIR_MAX_RUN_USD",
    process.env.NODE_ENV === "production" ? undefined : 5,
  );
  if (estimated > perRunCap) {
    throw new AirVideoServiceError("PER_RUN_SPEND_CAP", 429, false);
  }
  return estimated;
}

function readPositiveNumber(name: string, fallback?: number) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
  }
  return value;
}

function readPositiveInteger(name: string, fallback: number) {
  const value = readPositiveNumber(name, fallback);
  if (!Number.isInteger(value)) throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
  return value;
}

function isDefinitiveProviderRejection(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number"
    && status >= 400
    && status < 500
    && status !== 408
    && status !== 429;
}

function isAllowedFirstFrameUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!isStrictHttpsUrl(url)) return false;
  const host = url.hostname.toLowerCase();
  const allowlist = (process.env.GMI_UPLOAD_PUBLIC_HOST_ALLOWLIST ?? "storage.googleapis.com")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

/**
 * Air will issue a direct PUT to this URL, so Zap validates the provider's
 * signed target before returning it. Query parameters carry the signature;
 * credentials, custom ports, redirects, and unapproved hosts are rejected.
 */
function isAllowedGmiUploadUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!isStrictHttpsUrl(url)) return false;
  const host = url.hostname.toLowerCase();
  const allowlist = (process.env.GMI_UPLOAD_PUT_HOST_ALLOWLIST ?? "storage.googleapis.com")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

function isStrictHttpsUrl(url: URL) {
  return url.protocol === "https:"
    && Boolean(url.hostname)
    && !url.username
    && !url.password
    && !url.port
    && !url.hash;
}

function assertIdempotencyKey(value: string) {
  if (value.length < 16 || value.length > 256 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new AirVideoServiceError("INVALID_IDEMPOTENCY_KEY", 400, false);
  }
}

function parseInput<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AirVideoServiceError("INVALID_REQUEST", 400, false);
  return parsed.data;
}

function airRunId(idempotencyKey: string) {
  return `air_${digest(`run:${idempotencyKey}`).slice(0, 24)}`;
}

function airIdempotencyKey(idempotencyKey: string) {
  return `${AIR_REDIS_PREFIX}:idem:${digest(idempotencyKey)}`;
}

function airUploadTicketKey(idempotencyKey: string) {
  return `${AIR_REDIS_PREFIX}:upload-ticket:${digest(`ticket:${idempotencyKey}`)}`;
}

function airUploadTicketPendingKey(idempotencyKey: string) {
  return `${AIR_REDIS_PREFIX}:upload-ticket-pending:${digest(`ticket:${idempotencyKey}`)}`;
}

function airRunRecordKey(runId: string) {
  return `${AIR_REDIS_PREFIX}:run:${runId}`;
}

function digest(value: string) {
  const secret = process.env.ZAP_AIR_IDEMPOTENCY_HMAC_SECRET?.trim();
  if (!secret) throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
  return createHmac("sha256", secret).update(value).digest("hex");
}

function uploadTicketEncryptionKey() {
  const secret = process.env.ZAP_AIR_UPLOAD_TICKET_ENCRYPTION_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new AirVideoServiceError("SERVICE_CONFIGURATION", 503, true);
  }
  // Derive a fixed AES-256 key with domain separation; the configured secret
  // itself never appears in Redis or in a response.
  return createHash("sha256")
    .update("zap:service:air:v1:upload-ticket:key\0")
    .update(secret)
    .digest();
}

async function readCachedAirUploadTicket(
  redis: ReturnType<typeof requireRedis>,
  ticketKey: string,
): Promise<CachedAirUploadTicket | null> {
  const stored = await redis.get<unknown>(ticketKey);
  if (stored === null || stored === undefined) return null;
  if (typeof stored !== "string") {
    throw new AirVideoServiceError("UPLOAD_TICKET_CACHE_INVALID", 503, true);
  }
  return decryptAirUploadTicket(stored);
}

function assertMatchingUploadTicketInput(cached: CachedAirUploadTicket, inputDigest: string) {
  assertMatchingUploadTicketDigest(cached.inputDigest, inputDigest);
}

function assertMatchingUploadTicketDigest(expectedDigest: string, inputDigest: string) {
  const expected = Buffer.from(expectedDigest);
  const received = Buffer.from(inputDigest);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new AirVideoServiceError("IDEMPOTENCY_CONFLICT", 409, false);
  }
}

function encryptAirUploadTicket(value: CachedAirUploadTicket) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", uploadTicketEncryptionKey(), iv);
  cipher.setAAD(AIR_UPLOAD_TICKET_AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptAirUploadTicket(value: string): CachedAirUploadTicket {
  try {
    const [version, encodedIv, encodedTag, encodedCiphertext, extra] = value.split(".");
    if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext || extra !== undefined) {
      throw new Error("invalid encrypted ticket envelope");
    }
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    if (iv.byteLength !== 12 || tag.byteLength !== 16 || ciphertext.byteLength === 0) {
      throw new Error("invalid encrypted ticket envelope");
    }
    const decipher = createDecipheriv("aes-256-gcm", uploadTicketEncryptionKey(), iv);
    decipher.setAAD(AIR_UPLOAD_TICKET_AAD);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as unknown;
    if (!isCachedAirUploadTicket(parsed)) throw new Error("invalid encrypted ticket payload");
    return parsed;
  } catch {
    throw new AirVideoServiceError("UPLOAD_TICKET_CACHE_INVALID", 503, true);
  }
}

function isCachedAirUploadTicket(value: unknown): value is CachedAirUploadTicket {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const ticket = record.ticket;
  if (typeof ticket !== "object" || ticket === null || Array.isArray(ticket)) return false;
  const ticketRecord = ticket as Record<string, unknown>;
  const headers = ticketRecord.headers;
  if (typeof headers !== "object" || headers === null || Array.isArray(headers)) return false;
  const headerRecord = headers as Record<string, unknown>;
  return record.schemaVersion === 1
    && typeof record.inputDigest === "string"
    && /^[a-f0-9]{64}$/.test(record.inputDigest)
    && typeof record.expiresAtMs === "number"
    && Number.isSafeInteger(record.expiresAtMs)
    && record.expiresAtMs > 0
    && ticketRecord.method === "PUT"
    && (headerRecord["content-type"] === "image/jpeg" || headerRecord["content-type"] === "image/png")
    && Object.keys(headerRecord).length === 1
    && typeof ticketRecord.expiresAt === "string"
    && Number.isFinite(Date.parse(ticketRecord.expiresAt))
    && typeof ticketRecord.publicUrl === "string"
    && isAllowedFirstFrameUrl(ticketRecord.publicUrl)
    && typeof ticketRecord.uploadUrl === "string"
    && isAllowedGmiUploadUrl(ticketRecord.uploadUrl);
}

function gmiHeaders() {
  return {
    authorization: `Bearer ${process.env.GMI_API_KEY!.trim()}`,
    "content-type": "application/json",
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readString(value: unknown, paths: string[][]) {
  for (const path of paths) {
    const found = path.reduce<unknown>((current, segment) => {
      if (typeof current === "object" && current !== null) return (current as Record<string, unknown>)[segment];
      return undefined;
    }, value);
    if (typeof found === "string" && found) return found;
  }
  return undefined;
}

function tryJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
