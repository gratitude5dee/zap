import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditListing,
  checkListingUpdateGuardrails,
  getListing,
  LISTING_GUARDRAILS,
  loadStagedListings,
  missingEventDetails,
  searchListings,
  stageListingUpdate,
} from "../packages/cli/src/lib/listings.js";

type Snapshot = { description: string; kind: string; name: string };
const snapshots: Record<string, Snapshot> = {};
vi.mock("../agent/lib/catalog-reads.js", () => ({
  catalogReads: { get: () => ({ snapshots }) },
  recordCatalogRead: (listing: { description?: string | null; key: string; kind: string; name: string }) => {
    snapshots[listing.key.toLowerCase()] = { description: listing.description ?? "", kind: listing.kind, name: listing.name };
  },
}));

const repoRoot = process.cwd();
const cli = path.resolve(repoRoot, "packages/cli/bin/zap.js");

const tee = {
  active: true,
  description: "",
  imageUrl: null,
  inventory: null,
  key: "merch-drop-neon-wolf",
  kind: "physical",
  name: "Tee",
  priceCents: 3500,
  source: { runId: "run_1", stepId: "stage_listing", zap: "merch-drop" },
};
const show = {
  active: true,
  description: "Doors open 8pm at The Venue, 2026-10-01. Ticket admits one.",
  imageUrl: "https://media.wzrd.tech/u/casey/media/poster.png",
  inventory: 100,
  key: "show-night",
  kind: "physical",
  name: "Show night admission ticket",
  priceCents: 2500,
};
const clean = {
  active: true,
  description: "Studio-recorded 40 minute mix session, delivered as a private stream link within 48 hours of booking.",
  imageUrl: "https://media.wzrd.tech/u/casey/media/mix.png",
  inventory: null,
  key: "mix-session",
  kind: "service",
  name: "Private mix session (40 min)",
  priceCents: 12000,
};

const cleanups: Array<() => void> = [];
let dir: string;
let catalogPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "zap-listings-"));
  catalogPath = path.join(dir, "catalog.json");
  writeFileSync(catalogPath, JSON.stringify({ items: [tee, show, clean] }, null, 2));
  cleanups.push(() => rmSync(dir, { force: true, recursive: true }));
  for (const key of Object.keys(snapshots)) delete snapshots[key];
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

async function startAir({ status = 200 } = {}) {
  const requests: Array<{ authorization?: string; body: unknown; url?: string }> = [];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      requests.push({ authorization: request.headers.authorization, body: JSON.parse(raw), url: request.url });
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end(status === 200 ? JSON.stringify({ decisionId: "dec_9", ok: true, staged: true }) : JSON.stringify({ error: "gateway down" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => server.close());
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  return { environment: { apiBase: `http://127.0.0.1:${address.port}`, catalogPath, token: "gw_token" }, requests };
}

function readCatalog() {
  return JSON.parse(readFileSync(catalogPath, "utf8")) as { items: Array<Record<string, unknown>> };
}

describe("catalog-listings reasoning port", () => {
  it("audits the four measurements and ranks by impact", () => {
    expect(auditListing(tee).map((finding) => finding.code)).toEqual([
      "missing_description",
      "missing_image",
      "missing_inventory",
      "short_name",
    ]);
    expect(auditListing(show).map((finding) => finding.code)).toEqual(["kind_contradicted"]);
    expect(auditListing(clean)).toEqual([]);

    const rows = searchListings([tee, show, clean], { quality: true });
    expect(rows.map((row) => row.key)).toEqual(["merch-drop-neon-wolf", "show-night"]);
    expect(rows[0]).not.toHaveProperty("description");
    expect(searchListings([tee, show, clean], { query: "venue" }).map((row) => row.key)).toEqual(["show-night"]);
    expect(searchListings([tee, show, clean], { kind: "service" }).map((row) => row.key)).toEqual(["mix-session"]);
  });

  it("event copy must carry date, time, and venue/stream; names the missing categories", () => {
    expect(missingEventDetails("Doors open 8pm at The Venue, 2026-10-01.")).toEqual([]);
    expect(missingEventDetails("Warehouse show, 12 Oct, doors 8pm, 140 Front St")).toEqual([]);
    expect(missingEventDetails("Livestream Friday 7:30pm https://x.example/live")).toEqual([]);
    expect(missingEventDetails("At The Venue. Admits one.")).toEqual(["date", "time"]);
    expect(missingEventDetails("Doors 8pm. Admits one.")).toEqual(["date", "venue or stream link"]);
    const partial = auditListing({ ...show, description: "General admission at The Venue, main room. Ticket admits one.", kind: "event_ticket" });
    expect(partial.map((finding) => finding.code)).toEqual(["missing_event_details"]);
    expect(partial[0].message).toBe("Event ticket copy carries no date, time.");
  });

  it("skips malformed catalog entries with a reason instead of aborting the audit", async () => {
    writeFileSync(catalogPath, JSON.stringify({ items: [tee, { key: "broken" }, "junk", { key: "nokind", name: "X", priceCents: 1 }, clean] }));
    const loaded = await loadStagedListings({ catalogPath });
    expect(loaded.listings.map((listing) => listing.key)).toEqual(["merch-drop-neon-wolf", "mix-session"]);
    expect(loaded.skipped).toEqual([
      { index: 1, key: "broken", reason: "missing string `name`" },
      { index: 2, reason: "entry is not an object" },
      { index: 3, key: "nokind", reason: "missing string `kind`" },
    ]);
    expect(searchListings(loaded.listings, { quality: true }).map((row) => row.key)).toEqual(["merch-drop-neon-wolf"]);
  });

  it("entries air would drop on protected/blocked fields are skipped, not edited; an unknown kind stays repairable", async () => {
    const { environment, requests } = await startAir();
    const invalid = [
      { ...clean, key: "Bad Key!" },
      { ...clean, key: "free", priceCents: 0 },
      { ...clean, key: "fraction", priceCents: 12.5 },
      { ...clean, key: "too-rich", priceCents: 100_000_01 },
      { ...clean, key: "neg-stock", inventory: -1 },
      { ...clean, key: "text-stock", inventory: "12" },
    ];
    writeFileSync(catalogPath, JSON.stringify({ items: [...invalid, { ...clean, key: "odd-kind", kind: "ticket" }] }));
    const loaded = await loadStagedListings({ catalogPath });
    expect(loaded.listings.map((listing) => listing.key)).toEqual(["odd-kind"]);
    expect(loaded.skipped.map((entry) => [entry.key, entry.reason])).toEqual([
      ["Bad Key!", expect.stringMatching(/`key` is not a catalog slug/)],
      ["free", expect.stringMatching(/`priceCents` must be an integer from 1 to 10000000/)],
      ["fraction", expect.stringMatching(/`priceCents` must be an integer/)],
      ["too-rich", expect.stringMatching(/`priceCents` must be an integer/)],
      ["neg-stock", expect.stringMatching(/`inventory` must be a non-negative integer or null/)],
      ["text-stock", expect.stringMatching(/`inventory` must be a non-negative integer or null/)],
    ]);

    const before = readFileSync(catalogPath, "utf8");
    for (const key of ["free", "neg-stock"]) {
      await expect(stageListingUpdate({
        environment,
        items: [{ after: "Renamed", field: "name", target: key }],
        note: "title",
      })).rejects.toMatchObject({ code: "LISTING_UPDATE_GUARDRAIL", message: expect.stringMatching(/not in the staged catalog/) });
    }
    expect(requests).toEqual([]);
    expect(readFileSync(catalogPath, "utf8")).toBe(before);

    await stageListingUpdate({ environment, items: [{ after: "event_ticket", field: "kind", target: "odd-kind" }], note: "copy says ticket" });
    expect(requests).toHaveLength(1);
    expect(readCatalog().items.find((item) => item.key === "odd-kind")?.kind).toBe("event_ticket");
  });

  it("get_listing returns the record with findings and fails on unknown keys", () => {
    expect(getListing([tee, show], "SHOW-NIGHT").listing.key).toBe("show-night");
    expect(() => getListing([tee], "nope")).toThrow(/No catalog listing/);
  });

  it("guardrails: content fields only, price/stock blocked, protected fields held, one line per item", () => {
    const listings = [tee, show];
    expect(checkListingUpdateGuardrails([{ after: "event_ticket", field: "kind", target: "show-night" }], listings)).toEqual([]);
    expect(checkListingUpdateGuardrails([{ after: "1", field: "priceCents", target: "show-night" }], listings)).toEqual([
      expect.stringMatching(/priceCents.*cannot be changed through a listing update/),
    ]);
    expect(checkListingUpdateGuardrails([{ after: 0, field: "inventory", target: "show-night" }], listings)[0]).toMatch(/inventory/);
    expect(checkListingUpdateGuardrails([{ after: "https://evil.example/x.png", field: "imageUrl", target: "show-night" }], listings)[0]).toMatch(/protected/);
    expect(checkListingUpdateGuardrails([{ after: "other", field: "key", target: "show-night" }], listings)[0]).toMatch(/protected/);
    expect(checkListingUpdateGuardrails([{ after: "x", field: "category", target: "show-night" }], listings)[0]).toMatch(/not a listing content field/);
    expect(checkListingUpdateGuardrails([{ after: "ticket", field: "kind", target: "show-night" }], listings)[0]).toMatch(/kind for show-night must be one of/);
    expect(checkListingUpdateGuardrails([{ after: "x".repeat(201), field: "name", target: "show-night" }], listings)[0]).toMatch(/limit is 200/);
    expect(checkListingUpdateGuardrails([{ after: "   ", field: "name", target: "show-night" }], listings)[0]).toMatch(/cannot be empty/);
    expect(checkListingUpdateGuardrails([{ after: "A", field: "name", target: "ghost" }], listings)[0]).toMatch(/not in the staged catalog/);
    expect(checkListingUpdateGuardrails([
      { after: "A", field: "name", target: "show-night" },
      { after: "B", field: "name", target: "show-night" },
    ], listings)).toContainEqual(expect.stringMatching(/appears more than once/));
    expect(checkListingUpdateGuardrails([{ after: "A", before: "Old name", field: "name", target: "show-night" }], listings)[0]).toMatch(/changed since it was read/);
    expect(checkListingUpdateGuardrails([], listings)[0]).toMatch(/at least one/);
    const tooMany = Array.from({ length: LISTING_GUARDRAILS.maxItemsPerChange + 1 }, (_, index) => ({
      after: "x", field: "name", target: `k${index}`,
    }));
    expect(checkListingUpdateGuardrails(tooMany, listings)[0]).toMatch(/limit is 25 per change/);
  });
});

describe("stageListingUpdate", () => {
  it("dry run previews the diff and writes nothing", async () => {
    const before = readFileSync(catalogPath, "utf8");
    const result = await stageListingUpdate({
      dryRun: true,
      environment: { catalogPath },
      items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
      note: "copy says ticket",
    });
    expect(result).toMatchObject({ charges: false, dryRun: true, status: "planned" });
    expect(result.preview).toEqual([{ after: "event_ticket", before: "physical", field: "kind", target: "show-night" }]);
    expect(readFileSync(catalogPath, "utf8")).toBe(before);
  });

  it("requires a staging note and fails closed without a box gateway, leaving the catalog untouched", async () => {
    const before = readFileSync(catalogPath, "utf8");
    await expect(stageListingUpdate({
      environment: { catalogPath },
      items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
      note: " ",
    })).rejects.toMatchObject({ code: "LISTING_UPDATE_INVALID" });
    await expect(stageListingUpdate({
      environment: { catalogPath },
      items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
      note: "copy says ticket",
    })).rejects.toMatchObject({ code: "COMMERCE_UNCONFIGURED" });
    expect(readFileSync(catalogPath, "utf8")).toBe(before);
  });

  it("guardrail violations stage nothing and call air nothing", async () => {
    const { environment, requests } = await startAir();
    const before = readFileSync(catalogPath, "utf8");
    await expect(stageListingUpdate({
      environment,
      items: [{ after: "1", field: "priceCents", target: "show-night" }],
      note: "cheaper",
    })).rejects.toMatchObject({ code: "LISTING_UPDATE_GUARDRAIL" });
    expect(requests).toEqual([]);
    expect(readFileSync(catalogPath, "utf8")).toBe(before);
  });

  it("merges content edits under the lock and files exactly one publish_catalog decision", async () => {
    const { environment, requests } = await startAir();
    const result = await stageListingUpdate({
      environment,
      items: [
        { after: "event_ticket", before: "physical", field: "kind", target: "show-night" },
        { after: "  Neon Wolf tee — heavyweight cotton, unisex  ", field: "name", target: "merch-drop-neon-wolf" },
        { after: "Screen-printed Neon Wolf art on a heavyweight unisex tee.", field: "description", target: "merch-drop-neon-wolf" },
      ],
      note: "copy says ticket; tee title carries the buyer's words",
    });
    expect(result).toMatchObject({ applied: 3, charges: false, decisionId: "dec_9", decisionReused: false, status: "staged" });
    expect(requests).toEqual([{
      authorization: "Bearer gw_token",
      body: { action: "publish_catalog", note: "copy says ticket; tee title carries the buyer's words" },
      url: "/api/miniapps/commerce",
    }]);

    const catalog = readCatalog();
    const updatedShow = catalog.items.find((item) => item.key === "show-night");
    const updatedTee = catalog.items.find((item) => item.key === "merch-drop-neon-wolf");
    expect(updatedShow).toMatchObject({ ...show, kind: "event_ticket" });
    expect(updatedTee).toMatchObject({
      ...tee,
      description: "Screen-printed Neon Wolf art on a heavyweight unisex tee.",
      name: "Neon Wolf tee — heavyweight cotton, unisex",
    });
    expect(catalog.items.find((item) => item.key === "mix-session")).toEqual(clean);
    expect(existsSync(`${catalogPath}.lock`)).toBe(false);
  });

  it("rolls the edits back when air refuses publish_catalog, only while the file is still the one it wrote", async () => {
    const { environment, requests } = await startAir({ status: 503 });
    const before = readCatalog();
    await expect(stageListingUpdate({
      environment,
      items: [
        { after: "event_ticket", field: "kind", target: "show-night" },
        { after: "Screen-printed Neon Wolf art.", field: "description", target: "merch-drop-neon-wolf" },
      ],
      note: "copy says ticket",
    })).rejects.toMatchObject({ code: "COMMERCE_STAGE_FAILED", message: expect.stringMatching(/gateway down.*2 edit\(s\) were rolled back/) });
    expect(requests).toHaveLength(1);
    expect(readCatalog().items).toEqual(before.items);
    expect(existsSync(`${catalogPath}.lock`)).toBe(false);

    // A concurrent update that wrote the SAME value and whose publish succeeded
    // must keep its edit: the loser's rollback sees a different revision.
    const { environment: winner, requests: winnerRequests } = await startAir();
    const { environment: loser } = await startAir({ status: 500 });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      globalThis.fetch = originalFetch;
      await stageListingUpdate({
        environment: winner,
        items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
        note: "copy says ticket",
      });
      return originalFetch(...args);
    };
    try {
      await expect(stageListingUpdate({
        environment: loser,
        items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
        note: "copy says ticket",
      })).rejects.toMatchObject({ message: expect.stringMatching(/written again by another update.*1 edit\(s\) landed, so they were left in place.*shop_publish decision covers the catalog/) });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(winnerRequests).toHaveLength(1);
    expect(readCatalog().items.find((entry) => entry.key === "show-night")?.kind).toBe("event_ticket");

    // A hand edit that keeps the revision stamp is still "someone else wrote".
    const { environment: racing } = await startAir({ status: 500 });
    globalThis.fetch = async (...args) => {
      const catalog = readCatalog();
      const item = catalog.items.find((entry) => entry.key === "merch-drop-neon-wolf");
      if (item) item.name = "Hand-edited tee";
      writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
      return originalFetch(...args);
    };
    try {
      await expect(stageListingUpdate({
        environment: racing,
        items: [{ after: "Neon Wolf tee", field: "name", target: "merch-drop-neon-wolf" }],
        note: "title",
      })).rejects.toMatchObject({ message: expect.stringMatching(/left in place/) });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(readCatalog().items.find((entry) => entry.key === "merch-drop-neon-wolf")?.name).toBe("Hand-edited tee");
  });

  it("reports when the rollback itself fails instead of pretending the catalog is clean", async () => {
    const { environment } = await startAir({ status: 503 });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (...args) => {
      writeFileSync(catalogPath, "{ not json");
      return originalFetch(...args);
    };
    try {
      await expect(stageListingUpdate({
        environment,
        items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
        note: "copy says ticket",
      })).rejects.toMatchObject({ code: "COMMERCE_STAGE_FAILED", message: expect.stringMatching(/Rolling the edits back also failed \(.*invalid JSON.*\); the catalog at .* still holds them/) });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(existsSync(`${catalogPath}.lock`)).toBe(false);
  });

  it("mixed-case --set fields edit the real property", async () => {
    const { environment } = await startAir();
    await stageListingUpdate({ environment, items: [{ after: "Neon Wolf Tee", field: "Name", target: "merch-drop-neon-wolf" }], note: "title" });
    const updated = readCatalog().items.find((entry) => entry.key === "merch-drop-neon-wolf");
    expect(updated).toMatchObject({ name: "Neon Wolf Tee" });
    expect(updated).not.toHaveProperty("Name");
  });

  it("a missing catalog reads as empty; a corrupt one fails closed", async () => {
    rmSync(catalogPath);
    expect((await loadStagedListings({ catalogPath })).listings).toEqual([]);
    writeFileSync(catalogPath, "{not json");
    await expect(loadStagedListings({ catalogPath })).rejects.toMatchObject({ code: "COMMERCE_CATALOG_UNREADABLE" });
  });
});

describe("zap listings CLI", () => {
  function run(args: string[]) {
    return spawnSync(process.execPath, [cli, "listings", ...args], {
      cwd: dir,
      encoding: "utf8",
      env: { HOME: dir, NODE_ENV: "test", PATH: process.env.PATH ?? "", ZAP_AIR_CATALOG_PATH: catalogPath },
    });
  }

  it("audits without credentials", () => {
    const result = run(["audit", "--json"]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({ audited: 3, flagged: 2 });
    expect(payload.listings[0].key).toBe("merch-drop-neon-wolf");
  });

  it("update plans by default and blocks price edits with a non-zero exit", () => {
    const before = readFileSync(catalogPath, "utf8");
    const planned = run(["update", "show-night", "--set", "kind=event_ticket", "--note", "copy says ticket", "--json"]);
    expect(planned.status).toBe(0);
    expect(JSON.parse(planned.stdout)).toMatchObject({ charges: false, dryRun: true, status: "planned", violations: [] });

    const blocked = run(["update", "show-night", "--set", "priceCents=1", "--note", "cheaper", "--json"]);
    expect(blocked.status).toBe(1);
    expect(JSON.parse(blocked.stdout)).toMatchObject({ status: "blocked" });

    const live = run(["update", "show-night", "--set", "kind=event_ticket", "--note", "copy says ticket", "--live", "--json"]);
    expect(live.status).not.toBe(0);
    expect(JSON.parse(live.stdout).error.code).toBe("COMMERCE_UNCONFIGURED");
    expect(readFileSync(catalogPath, "utf8")).toBe(before);
  });
});

describe("Eve catalog tools", () => {
  const originalEnv = process.env.ZAP_AIR_CATALOG_PATH;
  beforeEach(() => { process.env.ZAP_AIR_CATALOG_PATH = catalogPath; });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ZAP_AIR_CATALOG_PATH;
    else process.env.ZAP_AIR_CATALOG_PATH = originalEnv;
  });

  it("search and get are read-only and get records provenance", async () => {
    const search = (await import("../agent/tools/search_listings")).default;
    const get = (await import("../agent/tools/get_listing")).default;
    expect(search.approval).toBeUndefined();
    expect(get.approval).toBeUndefined();
    const rows = await search.execute({ query: "", quality: true } as never, {} as never);
    expect(rows.listings.map((row) => row.key)).toEqual(["merch-drop-neon-wolf", "show-night"]);
    expect(snapshots).toEqual({});
    await get.execute({ key: "show-night" }, {} as never);
    expect(snapshots).toEqual({ "show-night": { description: show.description, kind: "physical", name: show.name } });
  });

  it("stage_listing_update refuses an edit whose target changed after get_listing, and refreshes the snapshot after staging", async () => {
    const stage = (await import("../agent/tools/stage_listing_update")).default;
    const { environment } = await startAir();
    process.env.ZAP_AIR_API_BASE = environment.apiBase;
    process.env.ZAP_AIR_GATEWAY_TOKEN = environment.token;
    cleanups.push(() => { delete process.env.ZAP_AIR_API_BASE; delete process.env.ZAP_AIR_GATEWAY_TOKEN; });
    snapshots["show-night"] = { description: show.description, kind: "physical", name: show.name };

    const catalog = readCatalog();
    const item = catalog.items.find((entry) => entry.key === "show-night");
    if (item) item.kind = "digital";
    writeFileSync(catalogPath, JSON.stringify(catalog));
    await expect(stage.execute({
      dryRun: false,
      items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
      note: "copy says ticket",
    } as never, {} as never)).rejects.toMatchObject({ code: "LISTING_UPDATE_GUARDRAIL", message: expect.stringMatching(/changed since it was read/) });
    expect(readCatalog().items.find((entry) => entry.key === "show-night")?.kind).toBe("digital");

    // A caller-supplied `before` that matches the disk cannot stand in for the read.
    await expect(stage.execute({
      dryRun: false,
      items: [{ after: "event_ticket", before: "digital", field: "kind", target: "show-night" }],
      note: "copy says ticket",
    } as never, {} as never)).rejects.toMatchObject({ code: "LISTING_UPDATE_GUARDRAIL", message: expect.stringMatching(/changed since it was read/) });
    expect(readCatalog().items.find((entry) => entry.key === "show-night")?.kind).toBe("digital");

    snapshots["show-night"].kind = "digital";
    const staged = await stage.execute({
      dryRun: false,
      items: [
        { after: "event_ticket", field: "kind", target: "show-night" },
        { after: " Show night ticket ", field: "name", target: "show-night" },
      ],
      note: "copy says ticket",
    } as never, {} as never);
    expect(staged).toMatchObject({ applied: 2, status: "staged" });
    expect(snapshots["show-night"]).toEqual({ description: show.description, kind: "event_ticket", name: "Show night ticket" });
  });

  it("stage_listing_update needs approval, a prior get_listing, and writes nothing on refusal", async () => {
    const stage = (await import("../agent/tools/stage_listing_update")).default;
    expect(stage.approval?.({ toolInput: { dryRun: false } } as never)).toBe("user-approval");
    expect(stage.approval?.({ toolInput: { dryRun: true } } as never)).toBe("not-applicable");
    const before = readFileSync(catalogPath, "utf8");
    await expect(stage.execute({
      dryRun: false,
      items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
      note: "copy says ticket",
    } as never, {} as never)).rejects.toThrow(/Read show-night with get_listing/);

    snapshots["show-night"] = { description: show.description, kind: "physical", name: show.name };
    const planned = await stage.execute({
      dryRun: true,
      items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
      note: "copy says ticket",
    } as never, {} as never);
    expect(planned).toMatchObject({ charges: false, dryRun: true, status: "planned" });
    await expect(stage.execute({
      dryRun: false,
      items: [{ after: "event_ticket", field: "kind", target: "show-night" }],
      note: "copy says ticket",
    } as never, {} as never)).rejects.toMatchObject({ code: "COMMERCE_UNCONFIGURED" });
    expect(readFileSync(catalogPath, "utf8")).toBe(before);
  });
});
