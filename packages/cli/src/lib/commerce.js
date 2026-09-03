// @ts-check
/**
 * Live executor for the staging-only commerce step kinds. It runs inside the
 * creator's air box and talks only to air's existing staging rails:
 *
 *   commerce.stage_listing   → merge an entry into ~/.hermes/miniapps/shop/catalog.json,
 *                              then POST /api/miniapps/commerce {action:"publish_catalog"}
 *                              which files a shop_publish decision for the owner.
 *   commerce.payment_request → POST /api/miniapps/commerce {action:"payment_request"}
 *                              which files a payment_request decision for the owner.
 *
 * Neither path charges a card or moves money: projection to the storefront and
 * any Stripe checkout happen only after the owner approves the decision.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describeStagedListing } from "@wzrdtech/core/planner";
import { ZapCliError } from "./errors.js";

const AIR_GATEWAY_SUFFIX = "/api/gateway/v1";
/** air's sanitizeCatalogItem limits: price 1c..$100k, key slug. */
export const MAX_PRICE_CENTS = 100_000_00;
export const CATALOG_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 20_000;
/** Bounded so a publish held under the catalog lock cannot outlive LOCK_STALE_MS. */
const COMMERCE_REQUEST_MS = 15_000;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export const COMMERCE_REMEDIATION = [
  "Run this Zap inside your air box (it reads ~/.hermes/.env automatically), or",
  "set ZAP_AIR_API_BASE=https://app.wzrd.tech and ZAP_AIR_GATEWAY_TOKEN=<box gateway token>.",
];

/**
 * @typedef {{ apiBase?: string, catalogPath: string, token?: string }} CommerceEnvironment
 */

/**
 * Resolve where the box catalog lives and how to reach air. Explicit
 * ZAP_AIR_* variables win; otherwise the box convention (~/.hermes/.env with
 * OPENAI_BASE_URL pointing at the air gateway and OPENAI_API_KEY holding the
 * gateway token) is used. The OPENAI_API_KEY fallback is only ever sent to the
 * host it was issued for: a ZAP_AIR_API_BASE that differs from the gateway
 * host must bring its own ZAP_AIR_GATEWAY_TOKEN.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [home]
 * @returns {CommerceEnvironment}
 */
export function resolveCommerceEnvironment(env = process.env, home = os.homedir()) {
  const hermes = { ...readHermesEnv(home), ...env };
  const catalogPath = expandHome(hermes.ZAP_AIR_CATALOG_PATH || path.join(home, ".hermes", "miniapps", "shop", "catalog.json"), home);
  const gatewayBase = (hermes.OPENAI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const gatewayApiBase = gatewayBase.endsWith(AIR_GATEWAY_SUFFIX) ? gatewayBase.slice(0, -AIR_GATEWAY_SUFFIX.length) : "";
  const apiBase = ((hermes.ZAP_AIR_API_BASE ?? "").trim() || gatewayApiBase).replace(/\/+$/, "");
  const explicitToken = (hermes.ZAP_AIR_GATEWAY_TOKEN ?? "").trim();
  const gatewayToken = apiBase && apiBase === gatewayApiBase ? (hermes.OPENAI_API_KEY ?? "").trim() : "";
  const token = explicitToken || gatewayToken;
  return { apiBase: apiBase || undefined, catalogPath, token: token || undefined };
}

/**
 * Bearer tokens only travel over TLS, except to loopback (local air dev).
 * @param {string} apiBase
 */
export function isSecureApiBase(apiBase) {
  let url;
  try {
    url = new URL(apiBase);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

/** @param {CommerceEnvironment} environment */
export function assertCommerceEnvironment(environment) {
  if (!environment.apiBase || !environment.token) {
    throw new ZapCliError({
      code: "COMMERCE_UNCONFIGURED",
      message: "Commerce staging needs an air box gateway (API base + gateway token) to file the owner decision.",
      remediation: COMMERCE_REMEDIATION,
    });
  }
  if (!isSecureApiBase(environment.apiBase)) {
    throw new ZapCliError({
      code: "COMMERCE_INSECURE_API_BASE",
      message: `Refusing to send the air gateway token to ${environment.apiBase}: the API base must be https:// (plain http is allowed only for localhost).`,
      remediation: "Set ZAP_AIR_API_BASE to an https:// URL such as https://app.wzrd.tech.",
    });
  }
}

/**
 * Build the catalog entry a stage_listing step writes. Field names mirror
 * air's sanitizeCatalogItem (priceCents / imageUrl, camelCase).
 * @param {any} step
 * @param {Record<string, unknown>} inputs
 * @param {{ imageUrl: string | null, runId: string, zap: string }} context
 */
export function buildCatalogEntry(step, inputs, { imageUrl, runId, zap }) {
  const preview = describeStagedListing(step, inputs);
  const priceCents = preview.priceCents;
  if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents < 1 || priceCents > MAX_PRICE_CENTS) {
    throw new ZapCliError({
      code: "COMMERCE_INVALID_LISTING",
      message: `Step ${step.id}: priceCents must resolve to an integer between 1 and ${MAX_PRICE_CENTS} (got ${JSON.stringify(priceCents)}).`,
      remediation: "Pass the price input in cents, e.g. --input PRICE_CENTS=3500.",
    });
  }
  const inventory = preview.inventory;
  if (inventory !== null && (typeof inventory !== "number" || !Number.isInteger(inventory) || inventory < 0)) {
    throw new ZapCliError({
      code: "COMMERCE_INVALID_LISTING",
      message: `Step ${step.id}: inventory must resolve to a non-negative integer or null (got ${JSON.stringify(inventory)}).`,
      remediation: "Pass the inventory input as a whole number, e.g. --input INVENTORY=100.",
    });
  }
  const description = interpolate(step.listing.description ?? "", inputs).slice(0, 2000);
  return {
    key: preview.key,
    kind: preview.kind,
    name: preview.name.trim().slice(0, 200),
    description,
    imageUrl,
    priceCents,
    inventory,
    active: true,
    source: { zap, runId, stepId: step.id },
  };
}

/**
 * Read → merge (by key) → write the box catalog document. The whole
 * read-modify-write runs under a lock file so concurrent `zap run --live`
 * processes cannot overwrite each other's listings; the write itself is an
 * atomic rename.
 * @param {string} catalogPath
 * @param {ReturnType<typeof buildCatalogEntry>} entry
 */
export async function upsertCatalogEntry(catalogPath, entry) {
  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  return withCatalogLock(catalogPath, async () => {
    const catalog = await readCatalogDocument(catalogPath);
    const index = catalog.items.findIndex(
      (/** @type {unknown} */ item) => typeof item === "object" && item !== null && "key" in item && item.key === entry.key,
    );
    const replaced = index >= 0;
    if (replaced) catalog.items[index] = entry;
    else catalog.items.push(entry);
    await writeCatalogDocument(catalogPath, catalog);
    return { catalog, replaced };
  });
}

/**
 * Atomic (tmp + rename) catalog write. Callers hold `withCatalogLock`.
 * Every write stamps a fresh `revision` so a writer can later tell whether
 * the document it left is still the one on disk. air reads `items` only.
 * @param {string} catalogPath
 * @param {{ items: unknown[] } & Record<string, unknown>} catalog
 * @returns {Promise<{ raw: string, revision: string }>}
 */
export async function writeCatalogDocument(catalogPath, catalog) {
  const revision = randomUUID();
  catalog.revision = revision;
  const raw = JSON.stringify(catalog, null, 2) + "\n";
  const tmp = `${catalogPath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, raw);
  await fs.rename(tmp, catalogPath);
  return { raw, revision };
}

/**
 * A missing catalog is an empty one; anything else (unparseable JSON, a
 * permission error, a non-object document) aborts so the next write cannot
 * erase listings we could not read.
 * @param {string} catalogPath
 * @returns {Promise<{ items: unknown[] } & Record<string, unknown>>}
 */
export async function readCatalogDocument(catalogPath) {
  let raw;
  try {
    raw = await fs.readFile(catalogPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { items: [] };
    throw catalogUnreadable(catalogPath, error instanceof Error ? error.message : String(error));
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = raw.trim() === "" ? { items: [] } : JSON.parse(raw);
  } catch (error) {
    throw catalogUnreadable(catalogPath, `invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw catalogUnreadable(catalogPath, "document is not a JSON object");
  }
  const document = /** @type {Record<string, unknown>} */ (parsed);
  if (document.items !== undefined && !Array.isArray(document.items)) {
    throw catalogUnreadable(catalogPath, "`items` is not an array");
  }
  return { ...document, items: Array.isArray(document.items) ? document.items : [] };
}

/**
 * @param {string} catalogPath
 * @param {string} reason
 */
function catalogUnreadable(catalogPath, reason) {
  return new ZapCliError({
    code: "COMMERCE_CATALOG_UNREADABLE",
    message: `Refusing to stage: could not read the box catalog at ${catalogPath} (${reason}). Nothing was written.`,
    remediation: "Fix or move the existing catalog.json (or set ZAP_AIR_CATALOG_PATH), then rerun.",
  });
}

/**
 * Exclusive inter-process lock via O_EXCL on `<catalog>.lock`. Locks older
 * than LOCK_STALE_MS are treated as abandoned by a crashed process.
 * @template T
 * @param {string} catalogPath
 * @param {() => Promise<T>} fn
 */
export async function withCatalogLock(catalogPath, fn) {
  const lockPath = `${catalogPath}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(`${process.pid}\n`);
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if (!isErrno(error, "EEXIST")) throw error;
      const stat = await fs.stat(lockPath).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        await fs.unlink(lockPath).catch(() => {});
        continue;
      }
      if (Date.now() > deadline) {
        throw new ZapCliError({
          code: "COMMERCE_CATALOG_LOCKED",
          message: `Another process holds the catalog lock at ${lockPath}.`,
          remediation: "Wait for the other `zap run --live` to finish, or delete the stale .lock file if no run is active.",
          retryable: true,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 30)));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.unlink(lockPath).catch(() => {});
  }
}

/**
 * @param {unknown} error
 * @param {string} code
 */
function isErrno(error, code) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

/**
 * Roots a live run may publish image files from: the run's own asset
 * directory, the project directory the CLI was invoked in, and the box inbox
 * where chat attachments land. Anything else on the box stays private.
 * @param {{ cwd?: string, home?: string, runDir?: string }} [options]
 */
export function defaultImageRoots({ cwd = process.cwd(), home = os.homedir(), runDir } = {}) {
  /** @type {string[]} */
  const roots = [cwd, path.join(home, ".hermes", "inbox")];
  if (runDir) roots.unshift(runDir);
  return roots;
}

/**
 * Resolve a local image path and check it is an image file inside one of the
 * allowed roots. Symlinks are followed before the root check.
 * @param {string} asset
 * @param {string[]} allowedRoots
 * @returns {Promise<{ path: string } | { reason: string }>}
 */
export async function resolvePublishableImage(asset, allowedRoots) {
  const absolute = path.resolve(asset);
  if (!IMAGE_EXTENSIONS.has(path.extname(absolute).toLowerCase())) {
    return { reason: `image ${asset} is not a supported image file (${[...IMAGE_EXTENSIONS].join(", ")})` };
  }
  let real;
  try {
    real = await fs.realpath(absolute);
  } catch {
    return { reason: `image ${asset} not found on disk` };
  }
  const roots = await Promise.all(allowedRoots.map((root) => fs.realpath(root).catch(() => null)));
  const inside = roots.some((root) => root !== null && (real === root || real.startsWith(root + path.sep)));
  if (!inside) {
    return { reason: `image ${asset} is outside the publishable roots (run assets, project directory, ~/.hermes/inbox); copy it into the project first` };
  }
  return { path: real };
}

/**
 * Hand a box-local image file to air's media lane so the listing gets a
 * public R2 URL (air drops any other host). Returns null when the asset is
 * not a publishable local file or the upload is refused — the listing still
 * stages, without an image.
 * @param {CommerceEnvironment} environment
 * @param {string | undefined} asset
 * @param {string[]} [allowedRoots]
 */
export async function publishListingImage(environment, asset, allowedRoots = defaultImageRoots()) {
  if (!asset) return { imageUrl: null, note: "listing has no image input" };
  if (/^https?:\/\//.test(asset)) return { imageUrl: asset, note: "remote image passed through; air keeps only R2-hosted URLs" };
  const resolved = await resolvePublishableImage(asset, allowedRoots);
  if ("reason" in resolved) return { imageUrl: null, note: resolved.reason };
  const absolute = resolved.path;
  const response = await fetch(`${environment.apiBase}/api/media/publish`, {
    body: JSON.stringify({ path: absolute, filename: path.basename(absolute) }),
    headers: { authorization: `Bearer ${environment.token}`, "content-type": "application/json" },
    method: "POST",
  }).catch((error) => ({ ok: false, status: 0, json: async () => ({ error: String(error) }) }));
  const body = /** @type {{ url?: string, error?: string }} */ (await response.json().catch(() => ({})));
  if (!response.ok || typeof body.url !== "string") {
    return { imageUrl: null, note: `media publish refused (${response.status}): ${body.error ?? "unknown error"}` };
  }
  return { imageUrl: body.url, note: "uploaded to the air media lane" };
}

/**
 * File the owner decision. `publish_catalog` reuses an open shop_publish
 * decision; `payment_request` creates a pending request + decision.
 * @param {CommerceEnvironment} environment
 * @param {Record<string, unknown>} action
 */
export async function postCommerceAction(environment, action) {
  assertCommerceEnvironment(environment);
  /** @type {Response} */
  let response;
  try {
    response = await fetch(`${environment.apiBase}/api/miniapps/commerce`, {
      body: JSON.stringify(action),
      headers: { authorization: `Bearer ${environment.token}`, "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(COMMERCE_REQUEST_MS),
    });
  } catch (error) {
    throw new ZapCliError({
      code: "COMMERCE_STAGE_FAILED",
      message: `air did not answer ${String(action.action)}: ${error instanceof Error ? error.message : String(error)}`,
      remediation: "Check that the box gateway is reachable; nothing was charged.",
      retryable: true,
    });
  }
  const body = /** @type {Record<string, unknown>} */ (await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new ZapCliError({
      code: "COMMERCE_STAGE_FAILED",
      message: `air refused ${String(action.action)} (${response.status}): ${String(body.error ?? "unknown error")}`,
      remediation: "Check the box gateway token and that the owner has a storefront; nothing was charged.",
      retryable: response.status >= 500,
    });
  }
  return body;
}

/**
 * @param {{ environment?: CommerceEnvironment, imageAsset?: string, imageRoots?: string[], inputs: Record<string, unknown>, runId: string, spec: any, step: any }} options
 */
export async function stageListing({ environment = resolveCommerceEnvironment(), imageAsset, imageRoots, inputs, runId, spec, step }) {
  assertCommerceEnvironment(environment);
  const image = await publishListingImage(environment, imageAsset, imageRoots);
  const entry = buildCatalogEntry(step, inputs, { imageUrl: image.imageUrl, runId, zap: spec.zap });
  const { replaced } = await upsertCatalogEntry(environment.catalogPath, entry);
  const decision = await postCommerceAction(environment, { action: "publish_catalog" });
  return {
    catalogPath: environment.catalogPath,
    charges: false,
    decisionId: typeof decision.decisionId === "string" ? decision.decisionId : undefined,
    decisionReused: decision.staged === false,
    imageNote: image.note,
    listing: entry,
    message: "Listing staged. Approve the shop_publish decision in air (Needs you) to make it buyable.",
    replaced,
    status: "staged",
  };
}

/**
 * @param {{ environment?: CommerceEnvironment, inputs: Record<string, unknown>, step: any }} options
 */
export async function stagePaymentRequest({ environment = resolveCommerceEnvironment(), inputs, step }) {
  assertCommerceEnvironment(environment);
  const request = step.payment_request;
  const amount = typeof request.amount === "string" ? Number(inputs[request.amount.slice("user.".length)]) : request.amount;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ZapCliError({
      code: "COMMERCE_INVALID_LISTING",
      message: `Step ${step.id}: payment_request.amount must resolve to a positive number.`,
      remediation: "Pass the amount input, e.g. --input AMOUNT=25.",
    });
  }
  const decision = await postCommerceAction(environment, {
    action: "payment_request",
    amount,
    currency: request.currency ?? "usd",
    memo: interpolate(request.memo ?? "", inputs).slice(0, 500) || undefined,
    payee: interpolate(request.payee, inputs),
  });
  return {
    charges: false,
    decisionId: typeof decision.decisionId === "string" ? decision.decisionId : undefined,
    message: "Payment request staged. The owner approves it in air before anything moves.",
    request: { amount, currency: request.currency ?? "usd", payee: request.payee },
    status: "staged",
  };
}

/**
 * @param {string} template
 * @param {Record<string, unknown>} inputs
 */
function interpolate(template, inputs) {
  return template.replace(/\{([A-Z0-9_]+)\}/g, (_, name) => {
    const value = inputs[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** @param {string} home */
function readHermesEnv(home) {
  const file = path.join(home, ".hermes", ".env");
  /** @type {Record<string, string>} */
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^export\s+/, "");
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    out[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * @param {string} value
 * @param {string} home
 */
function expandHome(value, home) {
  return value.startsWith("~/") ? path.join(home, value.slice(2)) : value;
}
