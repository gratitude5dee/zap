// @ts-check
/**
 * Payer-gate plumbing (C5/C25). Every `--live` path calls `resolvePayerStatus()`
 * before spending; `"missing"` fails with a structured PAYER_MISSING error and
 * never silently downgrades to plan mode.
 *
 * Resolution order: `ZAP_TEST_PAYER` (test fake from @wzrdtech/zap-runtime/testing)
 * → `ZAP_PAYER_MODE` → `"byok"` when a stored provider key or API token resolves
 * → `"missing"`.
 */
import { readAuthStore, readCredentialStore } from "./store.js";
import { ZapCliError } from "./errors.js";

export const PAYER_REMEDIATION = [
  "zap keys add <provider> …",
  "zap login --provider claude-code",
  "zap pay login --managed",
];

/** @typedef {"missing" | "byok" | "managed"} PayerMode */

/** @returns {Promise<PayerMode>} */
export async function resolvePayerStatus() {
  const testMode = process.env.ZAP_TEST_PAYER;
  if (testMode === "missing" || testMode === "byok" || testMode === "managed") {
    const { fakePayService } = await import("@wzrdtech/zap-runtime/testing");
    return fakePayService({ mode: testMode }).status();
  }
  const pinned = process.env.ZAP_PAYER_MODE;
  if (pinned === "missing" || pinned === "byok" || pinned === "managed") return pinned;
  const credentials = await readCredentialStore();
  if (Object.keys(credentials.secrets ?? {}).length > 0) return "byok";
  const auth = await readAuthStore();
  if (auth.managed && typeof auth.managed === "object") return "managed";
  if (auth.apiToken) return "byok";
  return "missing";
}

/**
 * Enforces the payer gate for a live path.
 * @param {string} what human-readable spend description, e.g. "zap run --live"
 * @returns {Promise<PayerMode>}
 */
export async function requirePayer(what) {
  const mode = await resolvePayerStatus();
  if (mode === "missing") {
    throw new ZapCliError({
      code: "PAYER_MISSING",
      message: `${what} requires a payer, and none is configured.`,
      remediation: PAYER_REMEDIATION,
      retryable: false,
    });
  }
  return mode;
}
