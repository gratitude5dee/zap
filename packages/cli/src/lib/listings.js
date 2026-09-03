// @ts-check
/**
 * Catalog-listings reasoning layer, ported from commerce-agents
 * `merchant-agent/skills/catalog-listings` (prompt/logic port, no package import).
 *
 * Reads are free. `stageListingUpdate` is the only write and it stays inside
 * air's existing staging rails: merge content edits into the box catalog, then
 * POST {action:"publish_catalog"} so the owner approves a shop_publish decision.
 * Nothing here charges, projects to the storefront, or touches price/stock.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { ZapCliError } from "./errors.js";
import {
  assertCommerceEnvironment,
  CATALOG_KEY_RE,
  MAX_PRICE_CENTS,
  postCommerceAction,
  readCatalogDocument,
  resolveCommerceEnvironment,
  withCatalogLock,
  writeCatalogDocument,
} from "./commerce.js";

export const LISTING_KINDS = /** @type {const} */ (["physical", "digital", "service", "event_ticket"]);

/** Guardrails mirror commerce-agents `MerchantAgentConfig` and air's `sanitizeCatalogItem`. */
export const LISTING_GUARDRAILS = /** @type {const} */ ({
  /** Content fields a listing update may carry. */
  editableFields: ["name", "description", "kind"],
  maxFieldChars: { description: 2000, name: 200 },
  maxItemsPerChange: 25,
  /** Price/stock belong to the Zap inputs (re-run the recipe), not a content edit. */
  blockedFields: ["priceCents", "inventory"],
  /** Never changed by the assistant. */
  protectedFields: ["key", "imageUrl", "active", "source"],
  thinDescriptionChars: 40,
});

/**
 * @typedef {{ key: string, kind: string, name: string, description?: string, imageUrl?: string | null, priceCents: number, inventory?: number | null, active?: boolean, source?: unknown }} CatalogListing
 * @typedef {{ target: string, field: string, before?: unknown, after: unknown }} ChangeItem
 * @typedef {{ code: string, impact: number, message: string, fix: string }} AuditFinding
 */

/**
 * Why a catalog entry is not a listing this skill can work on, or null when
 * it is. Content defects a content edit can repair (an unknown kind, thin
 * copy) pass; fields the skill may not touch must already satisfy air's
 * sanitizeCatalogItem, otherwise a content edit would republish an entry air
 * drops. Hand-edited catalogs are the usual source.
 * @param {unknown} item
 * @returns {string | null}
 */
export function describeMalformedListing(item) {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return "entry is not an object";
  const record = /** @type {Record<string, unknown>} */ (item);
  if (typeof record.key !== "string" || record.key.trim() === "") return "missing string `key`";
  if (!CATALOG_KEY_RE.test(record.key.toLowerCase())) return "`key` is not a catalog slug (a-z, 0-9, `-`, `_`; max 64)";
  if (typeof record.name !== "string") return "missing string `name`";
  if (typeof record.kind !== "string") return "missing string `kind`";
  if (record.description !== undefined && record.description !== null && typeof record.description !== "string") return "`description` is not a string";
  if (typeof record.priceCents !== "number" || !Number.isInteger(record.priceCents) || record.priceCents < 1 || record.priceCents > MAX_PRICE_CENTS) {
    return `\`priceCents\` must be an integer from 1 to ${MAX_PRICE_CENTS}; re-run the Zap with a valid PRICE_CENTS`;
  }
  if (record.inventory !== undefined && record.inventory !== null && (typeof record.inventory !== "number" || !Number.isInteger(record.inventory) || record.inventory < 0)) {
    return "`inventory` must be a non-negative integer or null; re-run the Zap with a valid INVENTORY";
  }
  return null;
}

/**
 * @param {unknown} item
 * @returns {item is CatalogListing}
 */
export function isCatalogListing(item) {
  return describeMalformedListing(item) === null;
}

/**
 * Lower-cases `field` so guardrails, preview, and the write all address the
 * same property (`--set Name=` must edit `name`, not add `Name`).
 * @param {ChangeItem[]} items
 * @returns {ChangeItem[]}
 */
export function normalizeChangeItems(items) {
  return items.map((item) => ({ ...item, field: item.field.trim().toLowerCase(), target: item.target.trim() }));
}

/**
 * Summary rows (never the full record) for a query; empty query lists everything.
 * `quality` keeps only listings with at least one audit finding, ranked by impact.
 * @param {CatalogListing[]} listings
 * @param {{ query?: string, quality?: boolean, kind?: string }} [filters]
 */
export function searchListings(listings, { query = "", quality = false, kind } = {}) {
  const needle = query.trim().toLowerCase();
  const rows = listings
    .filter((listing) => !kind || listing.kind === kind)
    .filter((listing) => {
      if (!needle) return true;
      const haystack = `${listing.key} ${listing.name} ${listing.description ?? ""} ${listing.kind}`.toLowerCase();
      return haystack.includes(needle);
    })
    .map((listing) => {
      const findings = auditListing(listing);
      return {
        active: listing.active !== false,
        findings: findings.length,
        impact: findings.reduce((sum, finding) => sum + finding.impact, 0),
        key: listing.key,
        kind: listing.kind,
        name: listing.name,
        priceCents: listing.priceCents,
      };
    })
    .filter((row) => !quality || row.findings > 0);
  return rows.sort((left, right) => right.impact - left.impact || left.key.localeCompare(right.key));
}

/**
 * @param {CatalogListing[]} listings
 * @param {string} key
 */
export function getListing(listings, key) {
  const wanted = key.trim().toLowerCase();
  const listing = listings.find((candidate) => candidate.key.toLowerCase() === wanted);
  if (!listing) {
    throw new ZapCliError({
      code: "LISTING_NOT_FOUND",
      message: `No catalog listing with key "${key}".`,
      remediation: "Run `zap listings search` to see the staged keys.",
    });
  }
  return { findings: auditListing(listing), listing };
}

/**
 * The four measurements the skill takes on every listing: missing attributes,
 * a description too thin to search on, a kind the record contradicts, and no
 * image where the kind usually has one.
 * @param {CatalogListing} listing
 * @returns {AuditFinding[]}
 */
export function auditListing(listing) {
  /** @type {AuditFinding[]} */
  const findings = [];
  const description = (listing.description ?? "").trim();
  const name = listing.name.trim();
  if (!description) {
    findings.push({ code: "missing_description", fix: "Write a description from the record and the creator's brief.", impact: 3, message: "No description." });
  } else if (description.length < LISTING_GUARDRAILS.thinDescriptionChars) {
    findings.push({ code: "thin_description", fix: "Expand the description with what the item is, who it is for, and what the record shows is notable.", impact: 2, message: `Description is ${description.length} chars; too thin to search on.` });
  }
  if (!LISTING_KINDS.includes(/** @type {any} */ (listing.kind))) {
    findings.push({ code: "invalid_kind", fix: `Stage a kind fix to one of ${LISTING_KINDS.join(", ")}.`, impact: 3, message: `Kind "${listing.kind}" is not a storefront kind.` });
  } else {
    const contradiction = kindContradiction(listing.kind, `${name} ${description}`.toLowerCase());
    if (contradiction) {
      findings.push({ code: "kind_contradicted", fix: `Stage a kind fix to ${contradiction} or reword the copy.`, impact: 2, message: `Copy reads like ${contradiction} but kind is ${listing.kind}.` });
    }
  }
  if (!listing.imageUrl && listing.kind !== "service") {
    findings.push({ code: "missing_image", fix: "Describe the shot to add (subject, angle, background); re-run the Zap's image step to produce it.", impact: 2, message: "No image where this kind usually has one." });
  }
  if (listing.kind === "physical" && (listing.inventory === undefined || listing.inventory === null)) {
    findings.push({ code: "missing_inventory", fix: "Re-run the Zap with INVENTORY set; stock is not a content edit.", impact: 1, message: "Physical listing has no inventory." });
  }
  if (listing.kind === "event_ticket") {
    const missing = missingEventDetails(`${name} ${description}`);
    if (missing.length) {
      findings.push({ code: "missing_event_details", fix: `Add the ${missing.join(", ")} to the description.`, impact: 2, message: `Event ticket copy carries no ${missing.join(", ")}.` });
    }
  }
  if (name.length < 4) {
    findings.push({ code: "short_name", fix: "Bring forward the words a buyer would type (item, size, material, section).", impact: 1, message: `Name "${name}" is too short to search on.` });
  }
  return findings;
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec";
const EVENT_DETAIL_PATTERNS = /** @type {const} */ ([
  ["date", new RegExp(`\\b(20\\d\\d|\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?|(?:${MONTHS})[a-z]*\\.?\\s+\\d{1,2}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})[a-z]*|(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?|today|tonight|tomorrow)\\b`, "i")],
  ["time", /\b(\d{1,2}[:.]\d\d|\d{1,2}\s?(?:am|pm)|doors|noon|midnight)\b/i],
  ["venue or stream link", /\b(venue|stream(?:ing)?|livestream|online|zoom|discord|live at|at the|hall|club|theat(?:re|er)|arena|stadium|studio|street|st|ave(?:nue)?|road|rd|blvd)\b|https?:\/\//i],
]);

/**
 * Event copy must carry all three of date, time, and venue/stream; returns the
 * categories the copy lacks.
 * @param {string} copy
 * @returns {string[]}
 */
export function missingEventDetails(copy) {
  return EVENT_DETAIL_PATTERNS.filter(([, pattern]) => !pattern.test(copy)).map(([label]) => label);
}

/**
 * @param {string} kind
 * @param {string} copy
 */
function kindContradiction(kind, copy) {
  if (kind !== "event_ticket" && /\b(ticket|admission|doors open|meetup|livestream|show on)\b/.test(copy)) return "event_ticket";
  if (kind !== "digital" && /\b(download|pdf|ebook|preset pack|wallpaper|zip file)\b/.test(copy)) return "digital";
  if (kind !== "physical" && /\b(t-shirt|tee|hoodie|print|poster print|mug|shipping)\b/.test(copy)) return "physical";
  return null;
}

/**
 * Operator-readable messages for every guardrail the items break; empty when
 * the change may proceed. Ported from commerce-agents `check_guardrails`.
 * @param {ChangeItem[]} items
 * @param {CatalogListing[]} listings
 * @returns {string[]}
 */
export function checkListingUpdateGuardrails(items, listings) {
  /** @type {string[]} */
  const violations = [];
  if (items.length === 0) violations.push("a listing update needs at least one field change");
  if (items.length > LISTING_GUARDRAILS.maxItemsPerChange) {
    violations.push(`change touches ${items.length} items and the limit is ${LISTING_GUARDRAILS.maxItemsPerChange} per change; stage it as separate changes within the limit, each approved on its own`);
  }
  const protectedFields = new Set(LISTING_GUARDRAILS.protectedFields.map((field) => field.toLowerCase()));
  const blocked = new Set(LISTING_GUARDRAILS.blockedFields.map((field) => field.toLowerCase()));
  const editable = new Set(LISTING_GUARDRAILS.editableFields.map((field) => field.toLowerCase()));
  const seen = new Set();
  for (const item of items) {
    const field = item.field.toLowerCase();
    const pair = `${item.target}\u0000${field}`;
    if (seen.has(pair)) violations.push(`'${item.field}' on ${item.target} appears more than once in this change — stage one line per item`);
    seen.add(pair);
    if (protectedFields.has(field)) {
      violations.push(`field '${item.field}' on ${item.target} is protected and cannot be changed by the assistant`);
      continue;
    }
    if (blocked.has(field)) {
      violations.push(`'${item.field}' cannot be changed through a listing update — re-run the Zap with new PRICE_CENTS / INVENTORY inputs so its own limits apply`);
      continue;
    }
    if (!editable.has(field)) {
      violations.push(`'${item.field}' on ${item.target} is not a listing content field (editable: ${LISTING_GUARDRAILS.editableFields.join(", ")})`);
      continue;
    }
    const listing = listings.find((candidate) => candidate.key.toLowerCase() === item.target.toLowerCase());
    if (!listing) {
      violations.push(`${item.target} is not in the staged catalog; read it with get_listing before proposing an edit`);
      continue;
    }
    if (field === "kind") {
      if (!LISTING_KINDS.includes(/** @type {any} */ (item.after))) {
        violations.push(`kind for ${item.target} must be one of ${LISTING_KINDS.join(", ")}`);
      }
    } else {
      const max = LISTING_GUARDRAILS.maxFieldChars[/** @type {"name" | "description"} */ (field)];
      if (typeof item.after !== "string") violations.push(`'${item.field}' on ${item.target} must be a string`);
      else if (field === "name" && item.after.trim() === "") violations.push(`name on ${item.target} cannot be empty`);
      else if (item.after.length > max) violations.push(`'${item.field}' on ${item.target} is ${item.after.length} chars and the limit is ${max}`);
    }
    const current = /** @type {Record<string, unknown>} */ (listing)[field === "kind" ? "kind" : field];
    if (item.before !== undefined && item.before !== (current ?? "")) {
      violations.push(`'${item.field}' on ${item.target} has changed since it was read (expected ${JSON.stringify(item.before)}); read it again before staging`);
    }
  }
  return violations;
}

/**
 * Pure preview: what each listing would look like after the change.
 * @param {ChangeItem[]} items
 * @param {CatalogListing[]} listings
 */
export function previewListingUpdate(items, listings) {
  return normalizeChangeItems(items).map((item) => {
    const listing = listings.find((candidate) => candidate.key.toLowerCase() === item.target.toLowerCase());
    const before = listing ? /** @type {Record<string, unknown>} */ (listing)[item.field] ?? "" : undefined;
    return { after: item.after, before, field: item.field, target: item.target };
  });
}

/**
 * Splits a catalog into the listings the skill can work on and the entries it
 * skips, so one hand-edited item never aborts a whole audit.
 * @param {unknown[]} items
 * @returns {{ listings: CatalogListing[], skipped: Array<{ index: number, key?: string, reason: string }> }}
 */
export function partitionCatalogItems(items) {
  /** @type {CatalogListing[]} */
  const listings = [];
  /** @type {Array<{ index: number, key?: string, reason: string }>} */
  const skipped = [];
  items.forEach((item, index) => {
    const reason = describeMalformedListing(item);
    if (reason === null) {
      listings.push(/** @type {CatalogListing} */ (item));
      return;
    }
    const key = item && typeof item === "object" && typeof (/** @type {Record<string, unknown>} */ (item).key) === "string"
      ? String(/** @type {Record<string, unknown>} */ (item).key)
      : undefined;
    skipped.push(key === undefined ? { index, reason } : { index, key, reason });
  });
  return { listings, skipped };
}

/**
 * @param {{ catalogPath?: string, env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<{ catalogPath: string, listings: CatalogListing[], skipped: Array<{ index: number, key?: string, reason: string }> }>}
 */
export async function loadStagedListings({ catalogPath, env } = {}) {
  const resolvedPath = catalogPath ?? resolveCommerceEnvironment(env).catalogPath;
  const catalog = await readCatalogDocument(resolvedPath);
  return { catalogPath: resolvedPath, ...partitionCatalogItems(catalog.items) };
}

/**
 * Stage content edits: re-check the guardrails under the catalog lock, merge
 * the edits, write atomically, then file/refresh the shop_publish decision.
 * The storefront changes only after the owner approves in air.
 * @param {{ environment?: import("./commerce.js").CommerceEnvironment, items: ChangeItem[], note: string, dryRun?: boolean }} options
 */
export async function stageListingUpdate({ environment = resolveCommerceEnvironment(), items: rawItems, note, dryRun = false }) {
  const items = normalizeChangeItems(rawItems);
  if (!note || !note.trim()) {
    throw new ZapCliError({
      code: "LISTING_UPDATE_INVALID",
      message: "A staging note saying why the change is right is required.",
      remediation: "Pass --note \"...\" (CLI) or `note` (tool).",
    });
  }
  const { listings } = await loadStagedListings({ catalogPath: environment.catalogPath });
  const violations = checkListingUpdateGuardrails(items, listings);
  if (violations.length) {
    throw new ZapCliError({
      code: "LISTING_UPDATE_GUARDRAIL",
      message: `That change exceeds the listing guardrails: ${violations.join("; ")}`,
      remediation: "Adjust the change so every line is a content edit within the limits, then stage again.",
    });
  }
  const preview = previewListingUpdate(items, listings);
  if (dryRun) {
    return {
      catalogPath: environment.catalogPath,
      charges: false,
      dryRun: true,
      message: `Would stage ${items.length} listing edit(s) and file a shop_publish decision. Nothing written.`,
      note,
      preview,
      status: "planned",
    };
  }

  assertCommerceEnvironment(environment);

  await fs.mkdir(path.dirname(environment.catalogPath), { recursive: true });
  /** @type {CatalogWrite} */
  const written = await withCatalogLock(environment.catalogPath, async () => {
    const catalog = await readCatalogDocument(environment.catalogPath);
    const preimage = JSON.stringify(catalog);
    const current = partitionCatalogItems(catalog.items).listings;
    const lockedViolations = checkListingUpdateGuardrails(items, current);
    if (lockedViolations.length) {
      throw new ZapCliError({
        code: "LISTING_UPDATE_GUARDRAIL",
        message: `That change can no longer be staged under the listing guardrails: ${lockedViolations.join("; ")}`,
        remediation: "Read the listing again and re-stage.",
        retryable: true,
      });
    }
    let applied = 0;
    for (const item of items) {
      const listing = current.find((candidate) => candidate.key.toLowerCase() === item.target.toLowerCase());
      if (!listing) continue;
      /** @type {Record<string, unknown>} */ (listing)[item.field] = item.field === "name" && typeof item.after === "string" ? item.after.trim() : item.after;
      applied += 1;
    }
    const { raw, revision } = await writeCatalogDocument(environment.catalogPath, catalog);
    return { applied, preimage, raw, revision };
  });

  let decision;
  try {
    decision = await postCommerceAction(environment, { action: "publish_catalog", note });
  } catch (error) {
    throw await rollbackListingUpdate(environment.catalogPath, written, error);
  }
  return {
    applied: written.applied,
    catalogPath: environment.catalogPath,
    charges: false,
    decisionId: typeof decision.decisionId === "string" ? decision.decisionId : undefined,
    decisionReused: decision.staged === false,
    dryRun: false,
    message: "Listing edits staged. Approve the shop_publish decision in air (Needs you) to update the storefront.",
    note,
    preview,
    status: "staged",
  };
}

/**
 * @typedef {{ applied: number, preimage: string, raw: string, revision: string }} CatalogWrite
 * `preimage` is the document before this update's edits; `raw`/`revision`
 * identify the exact document the update left on disk.
 */

/**
 * air refused the publish_catalog request after the edits were written, so
 * a later unrelated publish would otherwise carry them. Under the lock, put
 * the pre-edit document back only if the file is still byte-for-byte the one
 * this update wrote (same revision stamp). Any later writer — even one that
 * wrote the same values — leaves a different revision, and its own publish
 * covers the catalog as it now stands, so the file is left alone and the
 * outcome is folded into the error either way.
 * @param {string} catalogPath
 * @param {CatalogWrite} written
 * @param {unknown} cause
 * @returns {Promise<ZapCliError>}
 */
async function rollbackListingUpdate(catalogPath, written, cause) {
  const base = cause instanceof ZapCliError
    ? cause
    : new ZapCliError({ code: "COMMERCE_STAGE_FAILED", message: cause instanceof Error ? cause.message : String(cause), retryable: true });
  /** @type {string} */
  let outcome;
  try {
    const restored = await withCatalogLock(catalogPath, async () => {
      const raw = await fs.readFile(catalogPath, "utf8");
      const catalog = await readCatalogDocument(catalogPath);
      if (raw !== written.raw || catalog.revision !== written.revision) return false;
      await writeCatalogDocument(catalogPath, JSON.parse(written.preimage));
      return true;
    });
    outcome = restored
      ? `The ${written.applied} edit(s) were rolled back from the catalog; nothing is pending approval from this update.`
      : `The catalog was written again by another update after these ${written.applied} edit(s) landed, so they were left in place; that update's shop_publish decision covers the catalog as it now stands.`;
  } catch (error) {
    outcome = `Rolling the edits back also failed (${error instanceof Error ? error.message : String(error)}); the catalog at ${catalogPath} still holds them and the next publish_catalog would include them.`;
  }
  return new ZapCliError({
    code: base.code,
    message: `${base.message} ${outcome}`,
    remediation: base.remediation ?? "Fix the box gateway and stage the update again.",
    retryable: base.retryable,
  });
}
