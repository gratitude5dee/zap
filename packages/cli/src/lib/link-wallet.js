// @ts-check
/**
 * Thin, safe wrapper over the Stripe Link agent-wallet CLI (`@stripe/link-cli`).
 *
 * The Link wallet is a buyer-side agentic payer: the owner connects their own
 * Link account once, then each purchase is an explicit spend request the owner
 * approves in Link before any credential is issued. Zap never custodies funds
 * (C8) and never prints payment credentials (C24): full card credentials only
 * ever land in an owner-supplied 0600 output file; stdout carries redacted
 * data only (enforced by link-cli itself and by the allowlist in
 * `safeLinkFields`).
 *
 * Auth state lives in `~/.zap/pay/link/auth.json` (dir 0700, file 0600),
 * mirroring the managed session-key storage. The child process receives an
 * allowlisted environment only.
 */
import { execFile, execFileSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const MAX_OUTPUT_BYTES = 2_097_152;

/** Structured, safe failure — the message never embeds raw CLI output. */
export class LinkWalletError extends Error {
  /**
   * @param {string} code
   * @param {{ retryable?: boolean }} [options]
   */
  constructor(code, options = {}) {
    super(safeErrorMessage(code));
    this.name = "LinkWalletError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

const SAFE_MESSAGES = /** @type {Record<string, string>} */ ({
  CLI_UNAVAILABLE:
    "The Stripe Link CLI is not installed. Run `npm install -g @stripe/link-cli` and retry.",
  CLI_TIMEOUT: "The Link CLI timed out. Retry the command.",
  CLI_FAILED: "The Link CLI exited with an error. Retry, or run `zap pay link status` to check the connection.",
  INVALID_CLI_OUTPUT: "The Link CLI returned output Zap could not parse.",
  NOT_CONNECTED: "No Link wallet is connected. Run `zap pay link connect` first.",
  NOT_AUTHENTICATED: "No Link wallet is connected. Run `zap pay link connect` first.",
});

/** @param {string} code */
function safeErrorMessage(code) {
  return SAFE_MESSAGES[code] ?? `Link wallet operation failed (${code}).`;
}

/** @returns {string} */
export function linkAuthDir() {
  return process.env.ZAP_LINK_AUTH_DIR ?? path.join(os.homedir(), ".zap", "pay", "link");
}

/** @returns {string} */
export function linkAuthFile() {
  return path.join(linkAuthDir(), "auth.json");
}

/**
 * True when the stored auth file carries a real Link session (link-cli
 * writes `{ auth: null }` before any login completes).
 * @returns {Promise<boolean>}
 */
export async function linkAuthExists() {
  try {
    const raw = await fs.readFile(linkAuthFile(), "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && Boolean(/** @type {{ auth?: unknown }} */ (parsed).auth);
  } catch {
    return false;
  }
}

/** Removes the stored Link auth state (used by `zap pay link disconnect`). */
export async function removeLinkAuth() {
  await fs.rm(linkAuthFile(), { force: true });
}

/** @type {string | undefined} */
let cachedEntry;

/** @returns {string} entry path of the link-cli, or throws CLI_UNAVAILABLE */
export function resolveLinkCliEntry() {
  const override = process.env.ZAP_LINK_CLI_ENTRY;
  if (override) return override;
  if (cachedEntry) return cachedEntry;
  try {
    const packagePath = require.resolve("@stripe/link-cli/package.json");
    cachedEntry = path.join(path.dirname(packagePath), "dist", "cli.js");
    return cachedEntry;
  } catch {
    // Fall through to the global install (`npm i -g @stripe/link-cli`).
  }
  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8", timeout: 15_000 }).trim();
    const entry = path.join(globalRoot, "@stripe", "link-cli", "dist", "cli.js");
    if (existsSync(entry)) {
      cachedEntry = entry;
      return entry;
    }
  } catch {
    // npm unavailable — report the CLI missing below.
  }
  throw new LinkWalletError("CLI_UNAVAILABLE");
}

/**
 * Allowlisted child environment — never forwards Zap provider keys or
 * arbitrary process env to the payment CLI.
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function linkChildEnvironment(env) {
  /** @type {Record<string, string>} */
  const child = {
    CI: "1",
    LINK_CLI_SKIP_SKILL_INSTALL: "1",
    NO_UPDATE_NOTIFIER: "1",
  };
  for (const name of ["HOME", "LANG", "LC_ALL", "NODE_ENV", "PATH", "TEMP", "TMP", "TMPDIR", "TZ"]) {
    const value = env[name];
    if (value) child[name] = value;
  }
  return /** @type {NodeJS.ProcessEnv} */ (child);
}

/**
 * Runs `link-cli --auth <file> --format json <args…>` and returns parsed JSON.
 * @param {readonly string[]} args
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<unknown>}
 */
export async function runLinkCli(args, options = {}) {
  const entry = resolveLinkCliEntry();
  const authFile = linkAuthFile();
  await fs.mkdir(path.dirname(authFile), { mode: 0o700, recursive: true });
  let stdout = "";
  /** @type {unknown} */
  let executionError;
  try {
    stdout = await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [entry, "--auth", authFile, "--format", "json", ...args],
        {
          encoding: "utf8",
          env: linkChildEnvironment(process.env),
          maxBuffer: MAX_OUTPUT_BYTES,
          shell: false,
          timeout: options.timeoutMs ?? 30_000,
          windowsHide: true,
        },
        (/** @type {Error | null} */ error, /** @type {string} */ output) => {
          stdout = output;
          if (error) reject(error);
          else resolve(output);
        },
      );
    });
  } catch (error) {
    executionError = error;
  }
  await fs.chmod(authFile, 0o600).catch(() => undefined);
  const parsed = parseJson(stdout);
  const payload = Array.isArray(parsed) ? parsed.at(-1) : parsed;
  if (isErrorPayload(payload)) {
    throw new LinkWalletError(String(payload.error ?? payload.code), { retryable: true });
  }
  if (executionError) {
    const code = /** @type {{ code?: string, killed?: boolean }} */ (executionError);
    const timedOut = code.killed === true || code.code === "ETIMEDOUT";
    throw new LinkWalletError(timedOut ? "CLI_TIMEOUT" : "CLI_FAILED", { retryable: true });
  }
  if (parsed === undefined) throw new LinkWalletError("INVALID_CLI_OUTPUT");
  return parsed;
}

/** @param {string} output */
function parseJson(output) {
  const trimmed = output.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/**
 * Matches both link-cli error shapes: `{ error }` and `{ code, message }`.
 * @param {unknown} value
 * @returns {value is { error?: string, code?: string }}
 */
function isErrorPayload(value) {
  if (typeof value !== "object" || value === null) return false;
  const payload = /** @type {{ error?: unknown, code?: unknown, message?: unknown }} */ (value);
  if (typeof payload.error === "string") return true;
  return typeof payload.code === "string" && typeof payload.message === "string";
}

/**
 * Field allowlist applied to every payload before it reaches stdout/--json,
 * so a future link-cli field can never leak a credential through Zap (C24).
 */
const SAFE_FIELDS = new Set([
  "account",
  "authenticated",
  "account_label",
  "amount",
  "approval_url",
  "cancelled_at",
  "context",
  "created",
  "created_at",
  "credential_type",
  "currency",
  "expires_at",
  "id",
  "last4",
  "livemode",
  "merchant_name",
  "merchant_url",
  "phrase",
  "status",
  "test",
  "updated_at",
  "verification_url",
  "verification_url_complete",
]);

/**
 * @param {unknown} payload
 * @returns {Record<string, unknown> | Record<string, unknown>[]}
 */
export function safeLinkFields(payload) {
  if (Array.isArray(payload)) {
    return payload.map((entry) => /** @type {Record<string, unknown>} */ (safeLinkFields(entry)));
  }
  /** @type {Record<string, unknown>} */
  const safe = {};
  if (typeof payload !== "object" || payload === null) return safe;
  for (const [key, value] of Object.entries(payload)) {
    if (!SAFE_FIELDS.has(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
  }
  return safe;
}
