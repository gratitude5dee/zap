import { createHmac, timingSafeEqual } from "node:crypto";

const defaultToleranceSeconds = 5 * 60;

export interface ReplayStore {
  claim(eventId: string, expiresAtMs: number): Promise<boolean>;
}

export class MemoryReplayStore implements ReplayStore {
  readonly #events = new Set<string>();

  async claim(eventId: string) {
    if (this.#events.has(eventId)) return false;
    this.#events.add(eventId);
    return true;
  }
}

type SignatureInput = {
  eventId: string;
  rawBody: string;
  secret: string;
  timestamp: string;
};

export function createImessageBridgeSignature(input: SignatureInput) {
  const digest = createHmac("sha256", input.secret)
    .update(signaturePayload(input))
    .digest("hex");
  return `sha256=${digest}`;
}

type VerifyInput = SignatureInput & {
  nowMs?: number;
  replayStore: ReplayStore;
  signature: string;
  toleranceSeconds?: number;
};

export type ImessageBridgeVerification =
  | { ok: true }
  | { ok: false; reason: "invalid_request" | "invalid_signature" | "stale" | "replayed" };

export async function verifyImessageBridgeRequest(input: VerifyInput): Promise<ImessageBridgeVerification> {
  if (!input.eventId.trim() || !input.rawBody || !input.secret || !/^\d+$/.test(input.timestamp)) {
    return { ok: false, reason: "invalid_request" };
  }
  const toleranceSeconds = input.toleranceSeconds ?? defaultToleranceSeconds;
  const nowMs = input.nowMs ?? Date.now();
  const timestampMs = Number(input.timestamp) * 1_000;
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > toleranceSeconds * 1_000) {
    return { ok: false, reason: "stale" };
  }

  const expected = createImessageBridgeSignature(input);
  if (!safeEqual(expected, input.signature)) return { ok: false, reason: "invalid_signature" };

  const claimed = await input.replayStore.claim(input.eventId, nowMs + toleranceSeconds * 1_000);
  return claimed ? { ok: true } : { ok: false, reason: "replayed" };
}

function signaturePayload(input: SignatureInput) {
  return `${input.timestamp}.${input.eventId}.${input.rawBody}`;
}

function safeEqual(expected: string, actual: string) {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.byteLength === actualBytes.byteLength && timingSafeEqual(expectedBytes, actualBytes);
}
