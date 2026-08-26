/**
 * Thin typed client over the Box (ascii.dev) HTTP API. Method names map 1:1
 * to the airv2 control-plane client so operators can move between the two
 * without relearning the surface (goal.md §5.3.2).
 *
 * Every create/fork body carries `noEnv: true` (C1) and an `Idempotency-Key`
 * header backed by a SET-NX store (C26). `stop` never sends `force` (C11).
 */
import { z } from "zod";
import { SandboxStartLimit } from "../../contract.ts";

export type BoxState =
  | "provisioned"
  | "cloning"
  | "forking"
  | "ready"
  | "idle"
  | "archiving"
  | "archived"
  | "error"
  | string;

const BoxSchema = z.object({
  id: z.string(),
  state: z.string(),
  url: z.string().optional(),
  name: z.string().optional(),
  vcpu: z.number().optional(),
  memoryGB: z.number().optional(),
  createdAt: z.string().optional(),
});
export type Box = z.infer<typeof BoxSchema>;

const BoxEnvelopeSchema = z.object({
  ok: z.boolean().optional(),
  id: z.string().optional(),
  box: BoxSchema,
});

const CommandResultSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
});
export type BoxCommandResult = z.infer<typeof CommandResultSchema>;

const DesktopEnvelopeSchema = z.object({
  ok: z.boolean().optional(),
  success: z.boolean().optional(),
  desktopUrl: z.string().optional(),
});

const EventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.unknown().optional(),
  createdAt: z.string().optional(),
});
const EventsEnvelopeSchema = z.object({
  events: z.array(EventSchema).default([]),
  cursor: z.string().optional(),
});
export type BoxEvent = z.infer<typeof EventSchema>;

export class BoxApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BoxApiError";
    this.status = status;
  }
}

/** Both 429 payload codes map to SandboxStartLimit (verify item 14). */
export const START_LIMIT_REACHED = "start_limit_reached";
export const RATE_LIMITED = "rate_limited";

/** Provider-side auto-stop backstop; counts from start, not last activity. */
export const ZAP_BOX_TTL_SECONDS = 24 * 60 * 60;

/** Per-box env keys the runtime is allowed to carry (goal.md §7). */
export const BOX_RUNTIME_ENV_KEYS = [
  "TENANT_ID",
  "RUNTIME_ID",
  "RUNTIME_TOKEN",
  "GATEWAY_URL",
  "GATEWAY_TOKEN",
  "ZAP_ENVIRONMENT",
] as const;

const requiredForkEnv = ["TENANT_ID", "RUNTIME_ID", "RUNTIME_TOKEN"] as const;

/** SET-NX shaped idempotency guard (Upstash in prod, memory in tests). */
export interface IdempotencyStore {
  /** returns true when the key was newly set (the caller may proceed) */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  /** releases a pending marker so a failed create/fork can be retried */
  delete(key: string): Promise<void>;
}

export function memoryIdempotencyStore(): IdempotencyStore {
  const store = new Map<string, string>();
  return {
    async setNx(key, value) {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },
    async get(key) {
      return store.get(key) ?? null;
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

export interface BoxClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  idempotency?: IdempotencyStore;
  /** redacting log sink; the client never writes tokens through it */
  log?: (message: string) => void;
}

export interface ForkOptions {
  templateId: string;
  /** per-box env; must include TENANT_ID, RUNTIME_ID, RUNTIME_TOKEN */
  env: Record<string, string>;
  size?: "small" | "default" | "large";
  ttlSeconds?: number | null;
  idempotencyKey: string;
}

export interface CreateFromSnapshotOptions {
  from: string;
  env: Record<string, string>;
  size?: "small" | "default" | "large";
  ttlSeconds?: number | null;
  setupScript?: string;
  idempotencyKey: string;
}

export const BOX_API_BASE = "https://ascii.dev/api/box/v1";

function validateRuntimeEnv(env: Record<string, string>): void {
  for (const key of requiredForkEnv) {
    if (!env[key]?.trim()) {
      throw new Error(`box: per-box env is missing ${key}`);
    }
  }
  const allowed: readonly string[] = BOX_RUNTIME_ENV_KEYS;
  for (const key of Object.keys(env)) {
    if (!allowed.includes(key)) {
      throw new Error(`box: per-box env key ${key} is outside the runtime allowlist`);
    }
  }
}

function retryAfterSeconds(response: Response): number {
  const header = response.headers.get("retry-after");
  const parsed = header ? Number(header) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
}

export interface BoxClient {
  fork(options: ForkOptions): Promise<Box>;
  createFromSnapshot(options: CreateFromSnapshotOptions): Promise<Box>;
  resume(boxId: string): Promise<Box>;
  stop(boxId: string): Promise<Box>;
  remove(boxId: string): Promise<void>;
  get(boxId: string): Promise<Box>;
  waitUntilReady(boxId: string, timeoutMs?: number): Promise<Box>;
  exec(boxId: string, command: string, timeoutSeconds?: number): Promise<BoxCommandResult>;
  execDetached(boxId: string, command: string): Promise<{ eventStream: string }>;
  events(boxId: string, cursor?: string): Promise<{ events: BoxEvent[]; cursor?: string }>;
  readFile(boxId: string, path: string): Promise<string>;
  writeFile(boxId: string, path: string, content: string): Promise<void>;
  desktop(boxId: string, options?: { vnc?: boolean }): Promise<string | undefined>;
  rename(boxId: string, name: string): Promise<Box>;
  snapshot(boxId: string, name: string): Promise<{ snapshotId: string }>;
}

export function createBoxClient(options: BoxClientOptions): BoxClient {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error("box: missing API key — set BOX_API_KEY before any Box request");
  }
  const base = options.baseUrl ?? BOX_API_BASE;
  const fetchFn = options.fetchFn ?? fetch;
  const idempotency = options.idempotency ?? memoryIdempotencyStore();
  const log = options.log ?? (() => undefined);

  async function boxFetch<T>(
    path: string,
    schema: z.ZodType<T>,
    init?: RequestInit & { idempotencyKey?: string; confirmDelete?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    if (init?.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
    if (init?.confirmDelete) headers["X-Ascii-Confirm-Delete"] = init.confirmDelete;
    const response = await fetchFn(`${base}${path}`, { ...init, headers });
    if (response.status === 429) {
      const body = await response.text();
      if (body.includes(START_LIMIT_REACHED) || body.includes(RATE_LIMITED)) {
        throw new SandboxStartLimit(retryAfterSeconds(response), `box 429 on ${path}`);
      }
      throw new BoxApiError(429, body.slice(0, 500));
    }
    if (!response.ok) {
      const body = await response.text();
      throw new BoxApiError(response.status, body.slice(0, 500));
    }
    const json: unknown = await response.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new BoxApiError(502, `unexpected response shape from ${path}: ${parsed.error.message.slice(0, 300)}`);
    }
    log(`box ${init?.method ?? "GET"} ${path} ok`);
    return parsed.data;
  }

  async function idempotent(key: string, run: () => Promise<Box>): Promise<Box> {
    const fresh = await idempotency.setNx(`zap:box:idem:${key}`, "pending", 3600);
    if (!fresh) {
      const cached = await idempotency.get(`zap:box:idem:${key}:box`);
      if (cached) return BoxSchema.parse(JSON.parse(cached));
      throw new BoxApiError(409, `box: create/fork with idempotencyKey ${key} is already in flight`);
    }
    let box: Box;
    try {
      box = await run();
    } catch (error) {
      // release the pending marker so a transient failure doesn't lock the key
      await idempotency.delete(`zap:box:idem:${key}`);
      throw error;
    }
    await idempotency.setNx(`zap:box:idem:${key}:box`, JSON.stringify(box), 3600);
    return box;
  }

  return {
    async fork(opts) {
      validateRuntimeEnv(opts.env);
      return idempotent(opts.idempotencyKey, async () => {
        const envelope = await boxFetch(`/boxes/${opts.templateId}/fork`, BoxEnvelopeSchema, {
          method: "POST",
          idempotencyKey: opts.idempotencyKey,
          body: JSON.stringify({
            noEnv: true,
            env: opts.env,
            ttlSeconds: opts.ttlSeconds !== undefined ? opts.ttlSeconds : ZAP_BOX_TTL_SECONDS,
            ...(opts.size ? { size: opts.size } : {}),
          }),
        });
        return envelope.box;
      });
    },
    async createFromSnapshot(opts) {
      validateRuntimeEnv(opts.env);
      return idempotent(opts.idempotencyKey, async () => {
        const envelope = await boxFetch("/boxes", BoxEnvelopeSchema, {
          method: "POST",
          idempotencyKey: opts.idempotencyKey,
          body: JSON.stringify({
            from: opts.from,
            noEnv: true,
            env: opts.env,
            ttlSeconds: opts.ttlSeconds !== undefined ? opts.ttlSeconds : ZAP_BOX_TTL_SECONDS,
            ...(opts.size ? { size: opts.size } : {}),
            ...(opts.setupScript ? { setupScript: opts.setupScript } : {}),
          }),
        });
        return envelope.box;
      });
    },
    async resume(boxId) {
      const envelope = await boxFetch(`/boxes/${boxId}/resume`, BoxEnvelopeSchema, {
        method: "POST",
        body: JSON.stringify({ ttlSeconds: ZAP_BOX_TTL_SECONDS }),
      });
      return envelope.box;
    },
    async stop(boxId) {
      // never force — a refused stop means the snapshot is failing (C11)
      const envelope = await boxFetch(`/boxes/${boxId}/stop`, BoxEnvelopeSchema, { method: "POST" });
      return envelope.box;
    },
    async remove(boxId) {
      // delete requires echoing the target id in X-Ascii-Confirm-Delete (verify item 13)
      await boxFetch(`/boxes/${boxId}`, z.unknown(), { method: "DELETE", confirmDelete: boxId });
    },
    async get(boxId) {
      const envelope = await boxFetch(`/boxes/${boxId}`, BoxEnvelopeSchema);
      return envelope.box;
    },
    async waitUntilReady(boxId, timeoutMs = 240_000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const box = await this.get(boxId);
        if (box.state === "ready" || box.state === "idle") return box;
        if (box.state === "error") throw new BoxApiError(500, `box ${boxId} entered error state`);
        if (Date.now() > deadline) throw new BoxApiError(504, `box ${boxId} not ready after ${timeoutMs}ms`);
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
      }
    },
    exec(boxId, command, timeoutSeconds = 60) {
      return boxFetch(`/boxes/${boxId}/commands`, CommandResultSchema, {
        method: "POST",
        body: JSON.stringify({ command, timeoutSeconds }),
      });
    },
    async execDetached(boxId, command) {
      const envelope = await boxFetch(
        `/boxes/${boxId}/commands`,
        z.object({ eventStream: z.string() }),
        { method: "POST", body: JSON.stringify({ command, detached: true }) },
      );
      return envelope;
    },
    async events(boxId, cursor) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return boxFetch(`/boxes/${boxId}/events${query}`, EventsEnvelopeSchema);
    },
    async readFile(boxId, path) {
      const result = await this.exec(boxId, `cat ${JSON.stringify(path)}`);
      if (result.exitCode !== 0) throw new BoxApiError(404, `readFile ${path}: ${result.stderr}`);
      return result.stdout;
    },
    async writeFile(boxId, path, content) {
      await boxFetch(`/boxes/${boxId}/files`, z.unknown(), {
        method: "PUT",
        body: JSON.stringify({ path, content }),
      });
    },
    async desktop(boxId, opts) {
      const query = opts?.vnc ? "?vnc=1" : "?theme=light";
      const envelope = await boxFetch(`/boxes/${boxId}/desktop${query}`, DesktopEnvelopeSchema, {
        method: "POST",
      });
      if (envelope.ok === false || envelope.success === false) return undefined;
      return envelope.desktopUrl;
    },
    async rename(boxId, name) {
      const envelope = await boxFetch(`/boxes/${boxId}`, BoxEnvelopeSchema, {
        method: "PATCH",
        body: JSON.stringify({ name: name.slice(0, 120) }),
      });
      return envelope.box;
    },
    async snapshot(boxId, name) {
      return boxFetch(`/boxes/${boxId}/snapshot`, z.object({ snapshotId: z.string() }), {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
  };
}
