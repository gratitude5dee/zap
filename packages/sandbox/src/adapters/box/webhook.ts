import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Box webhook verification helpers. The receiving route lives in
 * packages/cloud once verify item 13 confirms the webhook contract; polling
 * `GET /boxes/{id}` stays the fallback either way. Signatures ride the
 * `X-Ascii-Signature` header; deliveries older than five minutes are
 * rejected and `delivery_id` makes processing idempotent.
 */
export const BOX_WEBHOOK_SIGNATURE_HEADER = "x-ascii-signature";
export const BOX_WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000;

export interface BoxWebhookDelivery {
  deliveryId: string;
  boxId: string;
  event: string;
  timestamp: string;
}

export function signBoxWebhook(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyBoxWebhook(input: {
  secret: string;
  body: string;
  signature: string;
  now?: number;
  timestamp: string;
}): boolean {
  const expected = signBoxWebhook(input.secret, input.body);
  const given = Buffer.from(input.signature, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (given.length !== want.length || !timingSafeEqual(given, want)) return false;
  const age = (input.now ?? Date.now()) - Date.parse(input.timestamp);
  return Number.isFinite(age) && age >= 0 && age <= BOX_WEBHOOK_MAX_AGE_MS;
}

/** Maps Box states onto runtime-row states: ready→ready, error→error, archived→stopped. */
export function runtimeStateForBoxState(state: string): "ready" | "error" | "stopped" | "provisioning" {
  if (state === "ready" || state === "idle") return "ready";
  if (state === "error") return "error";
  if (state === "archived" || state === "archiving") return "stopped";
  return "provisioning";
}
