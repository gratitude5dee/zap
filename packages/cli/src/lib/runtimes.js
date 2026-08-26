// @ts-check
/**
 * Runtime lifecycle plumbing for `zap runtime *`.
 *
 * Handles are acquired through the Box-first SandboxService contract
 * (@wzrdtech/zap-sandbox). Boxes are always created with `noEnv: true`
 * semantics — no host environment is ever forwarded into a sandbox (C6);
 * stop is never forced. The "fake" provider mounts only with
 * ZAP_ALLOW_FAKE_SANDBOX=1 and is used by tests.
 *
 * State is tracked in `.zap/runtimes.json` (metadata only, never secrets)
 * plus an in-process handle map so up→down in one process releases cleanly.
 */
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ZapCliError } from "./errors.js";

/** @type {Map<string, import("@wzrdtech/zap-sandbox").SandboxHandle>} */
const liveHandles = new Map();

export function runtimeStateFile(cwd = process.cwd()) {
  return path.join(cwd, ".zap", "runtimes.json");
}

/**
 * @typedef {Object} RuntimeRecord
 * @property {string} id
 * @property {string} provider
 * @property {string} idempotencyKey
 * @property {string} status
 * @property {string} [sandboxId]
 * @property {string} [createdAt]
 * @property {string} [runtime]
 * @property {string} [weight]
 * @property {string} [lock]
 * @property {string} [forkedFrom]
 */

/**
 * @param {string} [cwd]
 * @returns {Promise<{ runtimes: RuntimeRecord[], version: number }>}
 */
export async function readRuntimeState(cwd) {
  const file = runtimeStateFile(cwd);
  if (!existsSync(file)) return { runtimes: [], version: 1 };
  const parsed = JSON.parse(await fs.readFile(file, "utf8"));
  return { runtimes: parsed.runtimes ?? [], version: parsed.version ?? 1 };
}

/**
 * @param {{ runtimes: RuntimeRecord[], version: number }} state
 * @param {string} [cwd]
 */
export async function writeRuntimeState(state, cwd) {
  const file = runtimeStateFile(cwd);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ runtimes: state.runtimes, version: 1 }, null, 2) + "\n");
}

/**
 * Builds the sandbox service for a provider id. Only the fake provider is
 * available in-process at Z3; real Box/adapters mount via the runtime
 * composition (Z1/Z2 services) as they land.
 * @param {string} provider
 * @returns {Promise<import("@wzrdtech/zap-sandbox").SandboxService>}
 */
export async function sandboxServiceFor(provider) {
  if (provider === "fake") {
    if (process.env.ZAP_ALLOW_FAKE_SANDBOX !== "1") {
      throw new ZapCliError({
        code: "PROVIDER_UNSUPPORTED",
        message: "The fake sandbox provider mounts only with ZAP_ALLOW_FAKE_SANDBOX=1.",
        remediation: "Set ZAP_ALLOW_FAKE_SANDBOX=1 (tests only) or use a real provider.",
      });
    }
    const { fakeSandboxService } = await import("@wzrdtech/zap-runtime/testing");
    return fakeSandboxService();
  }
  throw new ZapCliError({
    code: "SANDBOX_UNAVAILABLE",
    message: `Sandbox provider "${provider}" is not mounted in this CLI build yet.`,
    remediation: "Box and adapter providers mount through the Zap runtime composition as those services land. Use zap compose --dry-run to plan without a sandbox.",
  });
}

/**
 * @param {string} runtimeId
 * @param {import("@wzrdtech/zap-sandbox").SandboxHandle} handle
 */
export function trackHandle(runtimeId, handle) {
  liveHandles.set(runtimeId, handle);
}

/** @param {string} runtimeId */
export function takeHandle(runtimeId) {
  const handle = liveHandles.get(runtimeId);
  liveHandles.delete(runtimeId);
  return handle;
}

/** @param {string} runtimeId */
export function peekHandle(runtimeId) {
  return liveHandles.get(runtimeId);
}

/**
 * Reconnects to a runtime recorded in state (same-process handle if present,
 * otherwise a provider re-acquire with the stored idempotency key).
 * @param {RuntimeRecord} record
 */
export async function reacquireHandle(record) {
  const live = liveHandles.get(record.id);
  if (live) return live;
  const service = await sandboxServiceFor(record.provider);
  const handle = await service.acquire({
    existing: record.sandboxId ? { id: record.sandboxId } : undefined,
    idempotencyKey: record.idempotencyKey,
    provider: /** @type {import("@wzrdtech/zap-sandbox").SandboxProviderId} */ (record.provider),
    purpose: "runtime",
  });
  liveHandles.set(record.id, handle);
  return handle;
}

/**
 * @param {{ runtimes: RuntimeRecord[] }} state
 * @param {string} runtimeId
 * @returns {RuntimeRecord}
 */
export function findRuntime(state, runtimeId) {
  const record = state.runtimes.find((runtime) => runtime.id === runtimeId);
  if (!record) {
    throw new ZapCliError({
      code: "RUN_NOT_FOUND",
      message: `Runtime ${runtimeId} was not found. Run zap runtime ps.`,
    });
  }
  return record;
}
