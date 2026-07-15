import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  active: new Map<string, number>(),
  assets: new Map<string, Array<Record<string, unknown>>>(),
  cleanup: new Map<string, number>(),
  daily: new Map<string, number>(),
  deletePersistedAsset: vi.fn(),
  expire: vi.fn(async () => 1),
  forceUploadPending: false,
  persist: vi.fn(async () => 1),
  redact: vi.fn(),
  records: new Map<string, unknown>(),
  runs: new Map<string, Record<string, unknown>>(),
  steps: new Map<string, Array<Record<string, unknown>>>(),
  submit: vi.fn(),
}));

vi.mock("../lib/redis", () => ({
  getRedis: () => ({
    createScript: <T>(source: string) => ({
      eval: async (keys: string[], args: string[]) => {
        if (source.includes("redis.call('EXISTS', KEYS[2])")) {
          if (state.records.has(keys[0]!)) return 0 as T;
          if (state.records.has(keys[1]!)) return -1 as T;
          state.records.set(keys[0]!, args[0]!);
          state.records.set(keys[1]!, JSON.parse(args[2]!));
          return 1 as T;
        }
        if (source.includes("ZCARD")) {
          const now = Number(args[0]);
          const ttl = Number(args[1]);
          for (const [member, score] of state.active) {
            if (score < now - ttl) state.active.delete(member);
          }
          const member = args[3]!;
          if (state.active.has(member)) return 2 as T;
          if (state.active.size >= Number(args[2])) return 0 as T;
          state.active.set(member, now);
          return 1 as T;
        }
        if (source.includes("local removed = redis.call('ZREM'")) {
          state.active.delete(args[0]!);
          return 1 as T;
        }
        if (source.includes("redis.call('ZREM', KEYS[1], ARGV[2])")) {
          const [, leaseKey] = keys;
          const [leaseToken, storageKey] = args;
          if (state.records.get(leaseKey!) !== leaseToken) return 0 as T;
          state.cleanup.delete(storageKey!);
          state.records.delete(leaseKey!);
          return 1 as T;
        }
        if (source.includes("redis.call('GET', KEYS[1]) ~= ARGV[1]")) {
          const [leaseKey] = keys;
          const [leaseToken] = args;
          if (state.records.get(leaseKey!) !== leaseToken) return 0 as T;
          state.records.delete(leaseKey!);
          return 1 as T;
        }
        if (source.includes("current = tonumber")) {
          const key = keys[0]!;
          const next = (state.daily.get(key) ?? 0) + Number(args[0]);
          if (next > Number(args[1])) return -1 as T;
          state.daily.set(key, next);
          return 1 as T;
        }
        throw new Error("Unexpected Redis script");
      },
    }),
    del: async (key: string) => Number(state.records.delete(key)),
    expire: state.expire,
    get: async <T>(key: string) => (state.records.get(key) ?? null) as T | null,
    persist: state.persist,
    set: async (key: string, value: unknown, options?: { ex?: number; nx?: boolean; px?: number }) => {
      if (options?.nx && state.forceUploadPending) return null;
      if (options?.nx && state.records.has(key)) return null;
      state.records.set(key, value);
      return "OK";
    },
    zadd: async (key: string, value: { member: string; score: number }) => {
      if (key.endsWith(":asset-cleanup")) {
        state.cleanup.set(value.member, value.score);
        return 1;
      }
      state.active.set(value.member, value.score);
      return 1;
    },
    zrange: async (key: string, _min: number | string, max: number, options: { count: number; offset: number }) => {
      if (!key.endsWith(":asset-cleanup")) return [];
      return [...state.cleanup.entries()]
        .filter(([, score]) => score <= max)
        .sort(([, left], [, right]) => left - right)
        .slice(options.offset, options.offset + options.count)
        .map(([member]) => member);
    },
    zrem: async (key: string, member: string) => key.endsWith(":asset-cleanup")
      ? Number(state.cleanup.delete(member))
      : Number(state.active.delete(member)),
  }),
}));

vi.mock("../lib/providers/router", () => ({
  submitGeneration: (...args: unknown[]) => state.submit(...args),
}));

vi.mock("../lib/run-ledger", () => ({
  addAssetLedger: async (input: Record<string, unknown>) => {
    const runId = String(input.runId);
    state.assets.set(runId, [...(state.assets.get(runId) ?? []), input]);
    return "asset_1";
  },
  createRunLedger: async (input: Record<string, unknown>) => {
    state.runs.set(String(input.runId), { ...input, costUsd: 0, status: "queued" });
  },
  getRunSnapshot: async (runId: string) => ({
    assets: state.assets.get(runId) ?? [],
    feedback: [],
    run: state.runs.get(runId) ?? null,
    statusUrl: `/runs/${runId}`,
    steps: state.steps.get(runId) ?? [],
  }),
  redactAirVideoAsset: (...args: unknown[]) => state.redact(...args),
  updateRunLedger: async (input: Record<string, unknown>) => {
    const current = state.runs.get(String(input.runId)) ?? {};
    state.runs.set(String(input.runId), { ...current, ...input });
  },
  upsertStepLedger: async (input: Record<string, unknown>) => {
    const runId = String(input.runId);
    const previous = state.steps.get(runId) ?? [];
    const index = previous.findIndex((step) => step.stepId === input.stepId);
    const next = [...previous];
    if (index >= 0) next[index] = { ...next[index], ...input };
    else next.push(input);
    state.steps.set(runId, next);
  },
}));

vi.mock("../lib/blob-store", () => ({
  deletePersistedAsset: (...args: unknown[]) => state.deletePersistedAsset(...args),
  hasAirBlobCredentials: () => Boolean(
    process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim(),
  ),
}));

import {
  createAirUploadTicket,
  cleanupExpiredAirVideoAssets,
  getAirVideoRun,
  isAirServiceAuthorized,
  parseAirUploadInput,
  parseAirVideoSubmitInput,
  recordAirVideoFailure,
  recordAirVideoAssetExpiry,
  scheduleAirVideoAssetCleanup,
  submitAirVideoRun,
} from "../lib/air-video-service";

describe("Air video service", () => {
  beforeEach(() => {
    state.active.clear();
    state.assets.clear();
    state.cleanup.clear();
    state.daily.clear();
    state.deletePersistedAsset.mockReset();
    state.deletePersistedAsset.mockResolvedValue(undefined);
    state.expire.mockClear();
    state.forceUploadPending = false;
    state.persist.mockClear();
    state.redact.mockReset();
    state.redact.mockResolvedValue(undefined);
    state.records.clear();
    state.runs.clear();
    state.steps.clear();
    state.submit.mockReset();
    state.submit.mockResolvedValue({ idemKey: "zap:idem:air", provider: "gmi", requestId: "gmi_request_1" });
    process.env.GMI_API_KEY = "test-gmi-key";
    process.env.ZAP_AIR_IDEMPOTENCY_HMAC_SECRET = "test-air-idempotency-hmac-secret";
    process.env.ZAP_AIR_UPLOAD_TICKET_ENCRYPTION_KEY = "test-air-upload-ticket-encryption-key-0123456789";
    process.env.GMI_SEEDANCE_FAST_USD_PER_SECOND = "0.152";
    process.env.ZAP_AIR_DAILY_CAP_USD = "5";
    process.env.ZAP_AIR_SERVICE_TOKEN = "air-service-token";
    delete process.env.ZAP_AIR_CONCURRENCY_LIMIT;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires an exact private bearer token", () => {
    expect(isAirServiceAuthorized(new Request("https://zap.test", { headers: { authorization: "Bearer air-service-token" } }))).toBe(true);
    expect(isAirServiceAuthorized(new Request("https://zap.test", { headers: { authorization: "Bearer wrong" } }))).toBe(false);
    expect(isAirServiceAuthorized(new Request("https://zap.test"))).toBe(false);
  });

  it("creates a direct GMI image upload ticket without receiving bytes", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      public_url: "https://storage.googleapis.com/gmi/first-frame.jpg",
      upload_url: "https://storage.googleapis.com/gmi/first-frame.jpg?signature=one",
    }), { status: 200 }));

    const ticket = await createAirUploadTicket(
      parseAirUploadInput({ mimeType: "image/jpeg", sizeBytes: 1024 }),
      "imessage.upload.0123456789",
    );

    expect(ticket).toMatchObject({
      headers: { "content-type": "image/jpeg" },
      method: "PUT",
      publicUrl: "https://storage.googleapis.com/gmi/first-frame.jpg",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ file_type: "jpeg" });
    fetchMock.mockRestore();
  });

  it("rejects a provider upload ticket whose direct PUT target is not allowlisted", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      public_url: "https://storage.googleapis.com/gmi/first-frame.jpg",
      upload_url: "https://untrusted.example/put?signature=one",
    }), { status: 200 }));

    await expect(createAirUploadTicket(
      parseAirUploadInput({ mimeType: "image/jpeg", sizeBytes: 1024 }),
      "imessage.upload.untrusted.0123456789",
    ))
      .rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID", retryable: true });
    fetchMock.mockRestore();
  });

  it("replays an encrypted upload ticket for the same idempotency key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      public_url: "https://storage.googleapis.com/gmi/first-frame.jpg",
      upload_url: "https://storage.googleapis.com/gmi/first-frame.jpg?signature=opaque",
    }), { status: 200 }));
    const input = parseAirUploadInput({ mimeType: "image/jpeg", sizeBytes: 1024 });
    const idempotencyKey = "imessage.upload.replay.0123456789";

    const first = await createAirUploadTicket(input, idempotencyKey);
    const replay = await createAirUploadTicket(input, idempotencyKey);

    expect(replay).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const encryptedValue = Array.from(state.records.values()).find((value) =>
      typeof value === "string" && value.startsWith("v1."),
    );
    expect(encryptedValue).toBeDefined();
    expect(String(encryptedValue)).not.toContain(first.uploadUrl);
    expect(String(encryptedValue)).not.toContain(first.publicUrl);
    fetchMock.mockRestore();
  });

  it("reissues a GMI ticket only after the encrypted ticket expiry", async () => {
    vi.useFakeTimers();
    const issuedAt = Date.UTC(2026, 0, 1, 0, 0, 0);
    vi.setSystemTime(issuedAt);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        public_url: "https://storage.googleapis.com/gmi/first-frame-one.jpg",
        upload_url: "https://storage.googleapis.com/gmi/first-frame-one.jpg?signature=one",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        public_url: "https://storage.googleapis.com/gmi/first-frame-two.jpg",
        upload_url: "https://storage.googleapis.com/gmi/first-frame-two.jpg?signature=two",
      }), { status: 200 }));
    const input = parseAirUploadInput({ mimeType: "image/jpeg", sizeBytes: 1024 });
    const idempotencyKey = "imessage.upload.expired.0123456789";

    try {
      const first = await createAirUploadTicket(input, idempotencyKey);
      // The in-memory Redis fixture does not enforce PX itself, so remove the
      // expired short lock and let the service's signed-ticket expiry decide.
      for (const key of state.records.keys()) {
        if (key.includes("upload-ticket-pending")) state.records.delete(key);
      }
      vi.setSystemTime(issuedAt + 15 * 60 * 1000 + 5_001);
      const reissued = await createAirUploadTicket(input, idempotencyKey);

      expect(reissued.publicUrl).not.toBe(first.publicUrl);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
      vi.useRealTimers();
    }
  });

  it("rejects a mismatched upload replay and makes a concurrent caller wait", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      public_url: "https://storage.googleapis.com/gmi/first-frame.jpg",
      upload_url: "https://storage.googleapis.com/gmi/first-frame.jpg?signature=opaque",
    }), { status: 200 }));
    const idempotencyKey = "imessage.upload.conflict.0123456789";
    await createAirUploadTicket(parseAirUploadInput({ mimeType: "image/jpeg", sizeBytes: 1024 }), idempotencyKey);
    await expect(createAirUploadTicket(
      parseAirUploadInput({ mimeType: "image/png", sizeBytes: 1024 }),
      idempotencyKey,
    )).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", retryable: false, status: 409 });

    state.records.clear();
    state.forceUploadPending = true;
    await expect(createAirUploadTicket(
      parseAirUploadInput({ mimeType: "image/jpeg", sizeBytes: 1024 }),
      "imessage.upload.pending.0123456789",
    )).rejects.toMatchObject({ code: "UPLOAD_TICKET_PENDING", retryable: true, status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it("rejects public ticket URLs with credentials or custom ports", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        public_url: "https://user:password@storage.googleapis.com/gmi/first-frame.jpg",
        upload_url: "https://storage.googleapis.com/gmi/first-frame.jpg?signature=one",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        public_url: "https://storage.googleapis.com:444/gmi/first-frame.jpg",
        upload_url: "https://storage.googleapis.com/gmi/first-frame.jpg?signature=two",
      }), { status: 200 }));

    await expect(createAirUploadTicket(
      parseAirUploadInput({ mimeType: "image/jpeg", sizeBytes: 1024 }),
      "imessage.upload.credentials.0123456789",
    )).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID", retryable: true });
    await expect(createAirUploadTicket(
      parseAirUploadInput({ mimeType: "image/jpeg", sizeBytes: 1024 }),
      "imessage.upload.port.0123456789",
    )).rejects.toMatchObject({ code: "UPLOAD_TICKET_INVALID", retryable: true });
    fetchMock.mockRestore();
  });

  it("does not expire the artifact cleanup index before a delayed cron can drain it", async () => {
    await scheduleAirVideoAssetCleanup(
      "air/air_abcdef012345abcdef012345/seedance.mp4",
      Date.now() + 24 * 60 * 60 * 1000,
    );

    expect(state.expire).not.toHaveBeenCalled();
    expect(state.persist).toHaveBeenCalledTimes(1);
  });

  it("keeps a due cleanup entry until Blob deletion has succeeded", async () => {
    const storageKey = "air/air_abcdef012345abcdef012345/seedance.mp4";
    state.cleanup.set(storageKey, Date.now() - 1);
    state.deletePersistedAsset.mockImplementationOnce(async () => {
      // The schedule is the durable source of truth while Blob deletion is in
      // flight; removing it first would make a process crash orphan the file.
      expect(state.cleanup.has(storageKey)).toBe(true);
    });

    await expect(cleanupExpiredAirVideoAssets()).resolves.toBe(1);

    expect(state.deletePersistedAsset).toHaveBeenCalledWith(storageKey);
    expect(state.cleanup.has(storageKey)).toBe(false);
  });

  it("keeps failed deletion work scheduled and recovers after a crashed worker lease", async () => {
    const storageKey = "air/air_abcdef012345abcdef012345/seedance.mp4";
    const leaseKey = `zap:service:air:v1:asset-cleanup-lease:${createHash("sha256").update(storageKey).digest("hex")}`;
    state.cleanup.set(storageKey, Date.now() - 1);
    state.deletePersistedAsset.mockRejectedValueOnce(new Error("Blob temporarily unavailable"));

    await expect(cleanupExpiredAirVideoAssets()).resolves.toBe(1);

    // A failed delete cannot discard the source-of-truth entry.
    expect(state.cleanup.has(storageKey)).toBe(true);
    expect(state.records.has(leaseKey)).toBe(false);

    // Simulate a function crash after leasing but before deletion. The primary
    // schedule still exists, so once the visibility lease expires another cron
    // can complete it.
    state.records.set(leaseKey, "abandoned-worker");
    state.cleanup.set(storageKey, Date.now() - 1);
    await expect(cleanupExpiredAirVideoAssets()).resolves.toBe(1);
    expect(state.deletePersistedAsset).toHaveBeenCalledTimes(1);
    expect(state.cleanup.has(storageKey)).toBe(true);

    state.records.delete(leaseKey);
    await expect(cleanupExpiredAirVideoAssets()).resolves.toBe(1);

    expect(state.deletePersistedAsset).toHaveBeenCalledTimes(2);
    expect(state.cleanup.has(storageKey)).toBe(false);
  });

  it("submits once, redacts prompt storage, and replays the durable run", async () => {
    const input = parseAirVideoSubmitInput({
      firstFrameUrl: "https://storage.googleapis.com/gmi/first-frame.jpg",
      prompt: "A neon owl flies through rain.",
    });

    const first = await submitAirVideoRun(input, "imessage.event.0123456789");
    const replay = await submitAirVideoRun(input, "imessage.event.0123456789");

    expect(first.status).toBe("queued");
    expect(replay).toMatchObject({ replayed: true, runId: first.runId, status: "queued" });
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(state.submit.mock.calls[0]?.[0]).toMatchObject({
      capability: "video.gen",
      durationS: 5,
      inputs: { firstFrameUrl: "https://storage.googleapis.com/gmi/first-frame.jpg" },
      model: "seedance-2-0-fast-260128",
      provider: "gmi",
    });
    expect(JSON.stringify([...state.records.values()])).not.toContain("A neon owl flies through rain.");
  });

  it("accepts a connected Vercel Blob store in production without a static Blob token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "store_air_test");
    vi.stubEnv("CONVEX_URL", "https://air.convex.cloud");
    vi.stubEnv("ZAP_CONVEX_SERVICE_TOKEN", "convex-service-token");
    vi.stubEnv("ZAP_AIR_MAX_RUN_USD", "5");

    await expect(submitAirVideoRun(
      parseAirVideoSubmitInput({ prompt: "A connected Blob store is valid production configuration." }),
      "imessage.event.oidc.123456",
    )).resolves.toMatchObject({ status: "queued" });
  });

  it("fails production preflight when neither Blob credential is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
    vi.stubEnv("BLOB_STORE_ID", "");
    vi.stubEnv("CONVEX_URL", "https://air.convex.cloud");
    vi.stubEnv("ZAP_CONVEX_SERVICE_TOKEN", "convex-service-token");

    await expect(submitAirVideoRun(
      parseAirVideoSubmitInput({ prompt: "The Blob credential gate must fail closed." }),
      "imessage.event.no-blob.123456",
    )).rejects.toMatchObject({ code: "SERVICE_CONFIGURATION", status: 503 });
    expect(state.submit).not.toHaveBeenCalled();
  });

  it("fails closed as submission_unknown after an ambiguous provider handoff", async () => {
    state.submit.mockRejectedValueOnce(new Error("network vanished"));
    const input = parseAirVideoSubmitInput({ prompt: "A safely recoverable request." });

    const first = await submitAirVideoRun(input, "imessage.event.unknown.123456");
    const replay = await submitAirVideoRun(input, "imessage.event.unknown.123456");

    expect(first).toMatchObject({ retryable: false, status: "submission_unknown" });
    expect(replay).toMatchObject({ replayed: true, status: "submission_unknown" });
    expect(state.submit).toHaveBeenCalledTimes(1);
  });

  it("does not leave a spend or concurrency reservation after a definitive provider rejection", async () => {
    state.submit.mockRejectedValueOnce({ status: 401 });
    const input = parseAirVideoSubmitInput({ prompt: "A request rejected before it can be accepted." });

    const result = await submitAirVideoRun(input, "imessage.event.rejected.123456");

    expect(result).toMatchObject({ retryable: false, status: "dead_letter" });
    expect(state.active.size).toBe(0);
    expect(state.submit).toHaveBeenCalledTimes(1);
  });

  it("projects a completed MP4 with a bounded Blob expiry and no provider metadata", async () => {
    const created = await submitAirVideoRun(
      parseAirVideoSubmitInput({ prompt: "A stable service projection." }),
      "imessage.event.completed.123456",
    );
    state.runs.set(created.runId, { ...(state.runs.get(created.runId) ?? {}), status: "done" });
    state.steps.set(created.runId, [{ stepId: "seedance", status: "done" }]);
    state.assets.set(created.runId, [{
      kind: "mp4",
      stepId: "seedance",
      url: "https://blob.vercel-storage.com/air/result.mp4",
    }]);
    const expiresAtMs = Date.now() + 60 * 60 * 1000;
    await recordAirVideoAssetExpiry(created.runId, expiresAtMs);

    const completed = await getAirVideoRun(created.runId);

    expect(completed).toMatchObject({
      runId: created.runId,
      status: "video_ready",
      video: {
        mimeType: "video/mp4",
        url: "https://blob.vercel-storage.com/air/result.mp4",
      },
    });
    expect(completed.video?.expiresAt).toBe(new Date(expiresAtMs).toISOString());
    expect(JSON.stringify(completed)).not.toContain("gmi_request_1");
  });

  it("returns bounded progress and a stable failure code without provider diagnostics", async () => {
    const created = await submitAirVideoRun(
      parseAirVideoSubmitInput({ prompt: "A status contract test." }),
      "imessage.event.failure-status.123456",
    );
    state.runs.set(created.runId, {
      ...(state.runs.get(created.runId) ?? {}),
      error: "provider response included a secret URL",
      status: "running",
    });
    state.steps.set(created.runId, [{
      error: "provider response included a secret URL",
      progress: 0.5,
      status: "running",
      stepId: "seedance",
    }]);

    const running = await getAirVideoRun(created.runId);
    expect(running).toMatchObject({ progress: 50, status: "running" });
    expect(JSON.stringify(running)).not.toContain("secret URL");

    state.steps.set(created.runId, [{ progress: 250, status: "running", stepId: "seedance" }]);
    await expect(getAirVideoRun(created.runId)).resolves.toMatchObject({ progress: 99, status: "running" });

    await recordAirVideoFailure(created.runId, "provider response included a secret URL");
    const failed = await getAirVideoRun(created.runId);
    expect(failed).toMatchObject({ errorCode: "PROVIDER_FAILED", progress: 100, status: "dead_letter" });
    expect(JSON.stringify(failed)).not.toContain("secret URL");
  });
});
