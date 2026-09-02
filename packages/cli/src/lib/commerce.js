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
import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describeStagedListing } from "@wzrdtech/core/planner";
import { ZapCliError } from "./errors.js";

const AIR_GATEWAY_SUFFIX = "/api/gateway/v1";
const MAX_PRICE_CENTS = 100_000_00;

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
 * gateway token) is used. A plain OpenAI key is never reused as a token.
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [home]
 * @returns {CommerceEnvironment}
 */
export function resolveCommerceEnvironment(env = process.env, home = os.homedir()) {
  const hermes = { ...readHermesEnv(home), ...env };
  const catalogPath = expandHome(hermes.ZAP_AIR_CATALOG_PATH || path.join(home, ".hermes", "miniapps", "shop", "catalog.json"), home);
  const gatewayBase = (hermes.OPENAI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const onAirGateway = gatewayBase.endsWith(AIR_GATEWAY_SUFFIX);
  const apiBase = (hermes.ZAP_AIR_API_BASE || (onAirGateway ? gatewayBase.slice(0, -AIR_GATEWAY_SUFFIX.length) : "")).trim().replace(/\/+$/, "");
  const token = (hermes.ZAP_AIR_GATEWAY_TOKEN || (onAirGateway ? hermes.OPENAI_API_KEY : "") || "").trim();
  return { apiBase: apiBase || undefined, catalogPath, token: token || undefined };
}

/** @param {CommerceEnvironment} environment */
export function assertCommerceEnvironment(environment) {
  if (environment.apiBase && environment.token) return;
  throw new ZapCliError({
    code: "COMMERCE_UNCONFIGURED",
    message: "Commerce staging needs an air box gateway (API base + gateway token) to file the owner decision.",
    remediation: COMMERCE_REMEDIATION,
  });
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
 * Read → merge (by key) → write the box catalog document.
 * @param {string} catalogPath
 * @param {ReturnType<typeof buildCatalogEntry>} entry
 */
export async function upsertCatalogEntry(catalogPath, entry) {
  const catalog = await readCatalogDocument(catalogPath);
  const index = catalog.items.findIndex(
    (/** @type {unknown} */ item) => typeof item === "object" && item !== null && "key" in item && item.key === entry.key,
  );
  const replaced = index >= 0;
  if (replaced) catalog.items[index] = entry;
  else catalog.items.push(entry);
  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  const tmp = `${catalogPath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(catalog, null, 2) + "\n");
  await fs.rename(tmp, catalogPath);
  return { catalog, replaced };
}

/** @param {string} catalogPath */
export async function readCatalogDocument(catalogPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(catalogPath, "utf8"));
    const items = parsed && typeof parsed === "object" && Array.isArray(parsed.items) ? parsed.items : [];
    return { ...(parsed && typeof parsed === "object" ? parsed : {}), items };
  } catch {
    return { items: /** @type {unknown[]} */ ([]) };
  }
}

/**
 * Hand a box-local image file to air's media lane so the listing gets a
 * public R2 URL (air drops any other host). Returns null when the asset is
 * not a local file or the upload is refused — the listing still stages.
 * @param {CommerceEnvironment} environment
 * @param {string | undefined} asset
 */
export async function publishListingImage(environment, asset) {
  if (!asset) return { imageUrl: null, note: "listing has no image input" };
  if (/^https?:\/\//.test(asset)) return { imageUrl: asset, note: "remote image passed through; air keeps only R2-hosted URLs" };
  const absolute = path.resolve(asset);
  if (!existsSync(absolute)) return { imageUrl: null, note: `image ${asset} not found on disk` };
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
  const response = await fetch(`${environment.apiBase}/api/miniapps/commerce`, {
    body: JSON.stringify(action),
    headers: { authorization: `Bearer ${environment.token}`, "content-type": "application/json" },
    method: "POST",
  });
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
 * @param {{ environment?: CommerceEnvironment, imageAsset?: string, inputs: Record<string, unknown>, runId: string, spec: any, step: any }} options
 */
export async function stageListing({ environment = resolveCommerceEnvironment(), imageAsset, inputs, runId, spec, step }) {
  assertCommerceEnvironment(environment);
  const image = await publishListingImage(environment, imageAsset);
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
