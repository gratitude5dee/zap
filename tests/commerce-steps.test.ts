import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeStagedListing,
  isLocalStep,
  listingKey,
  orderCommerceSteps,
  planZapRun,
  quoteStep,
} from "../packages/core/src/planner.ts";
import { isCommerceStep, parseZapMarkdown, zapSpecSchema } from "../packages/core/src/schema.ts";
import {
  buildCatalogEntry,
  resolveCommerceEnvironment,
  stageListing,
  upsertCatalogEntry,
} from "../packages/cli/src/lib/commerce.js";

const repoRoot = process.cwd();
const cli = path.resolve(repoRoot, "packages/cli/bin/zap.js");

function recipe(steps: string, inputs = "") {
  return `---
zap: commerce-demo
version: 2
description: demo
inputs:
  image: { type: image, required: true }
  NAME: { type: string, required: true }
  PRICE_CENTS: { type: number, required: true }
  STOCK: { type: number, required: false }
${inputs}budget:
  estimate_usd: 0.05
  cap_usd: 1
defaults:
  provider: fal
steps:
${steps}
---
`;
}

const merchSteps = `  - id: art
    kind: image.gen
    prompt: Product art for {NAME}
    inputs: [user.image]
  - id: listing
    kind: commerce.stage_listing
    inputs: [art]
    listing:
      kind: physical
      name: "{NAME} Tee"
      description: "Drop for {NAME}"
      priceCents: user.PRICE_CENTS
      inventory: user.STOCK
      image: art
`;

describe("commerce.stage_listing schema + planner", () => {
  it("parses and validates through zapSpecSchema", () => {
    const spec = parseZapMarkdown(recipe(merchSteps));
    expect(zapSpecSchema.safeParse(spec).success).toBe(true);
    const listing = spec.steps[1];
    expect(listing).toMatchObject({
      id: "listing",
      kind: "commerce.stage_listing",
      listing: { image: "art", kind: "physical", priceCents: "user.PRICE_CENTS" },
    });
    expect(isCommerceStep(listing!)).toBe(true);
    expect(isLocalStep(listing!)).toBe(true);
  });

  it("rejects listings without a body, with bad kinds, or with out-of-range prices", () => {
    expect(() => parseZapMarkdown(recipe(`  - id: listing
    kind: commerce.stage_listing
`))).toThrow(/missing its listing/);
    expect(() => parseZapMarkdown(recipe(`  - id: listing
    kind: commerce.stage_listing
    listing: { kind: subscription, name: X, priceCents: 100 }
`))).toThrow();
    expect(() => parseZapMarkdown(recipe(`  - id: listing
    kind: commerce.stage_listing
    listing: { kind: digital, name: X, priceCents: 0 }
`))).toThrow();
    expect(() => parseZapMarkdown(recipe(`  - id: listing
    kind: commerce.stage_listing
    listing: { kind: digital, name: X, priceCents: 10000001 }
`))).toThrow();
  });

  it("requires listing.image to point at an earlier image step or a user input", () => {
    expect(() => parseZapMarkdown(recipe(`  - id: listing
    kind: commerce.stage_listing
    listing: { kind: digital, name: X, priceCents: 100, image: art }
  - id: art
    kind: image.gen
    prompt: later
`))).toThrow(/listing.image must reference an earlier image step/);
    expect(() => parseZapMarkdown(recipe(`  - id: listing
    kind: commerce.stage_listing
    listing: { kind: digital, name: X, priceCents: 100, image: user.image }
`))).not.toThrow();
  });

  it("quotes $0 and never adds provider spend to the estimate", () => {
    const spec = parseZapMarkdown(recipe(merchSteps));
    expect(quoteStep(spec.steps[1]!)).toBe(0);
    const plan = planZapRun(spec, 0);
    expect(plan.estimateUsd).toBe(quoteStep(spec.steps[0]!));
    expect(plan.steps.map((step) => step.id)).toEqual(["art", "listing"]);
  });

  it("orders commerce steps after the media steps that feed them", () => {
    const spec = parseZapMarkdown(recipe(`  - id: art
    kind: image.gen
    prompt: art
  - id: listing
    kind: commerce.stage_listing
    listing: { kind: digital, name: X, priceCents: 100, image: art }
  - id: clip
    kind: video.gen
    prompt: clip
    duration_s: 4
    inputs: [art]
`));
    expect(orderCommerceSteps(spec.steps).map((step) => step.id)).toEqual(["art", "clip", "listing"]);
    expect(planZapRun(spec, 0).steps.map((step) => step.id)).toEqual(["art", "clip", "listing"]);
  });

  it("describes what it WOULD stage without performing anything", () => {
    const spec = parseZapMarkdown(recipe(merchSteps));
    expect(describeStagedListing(spec.steps[1]!, { NAME: "Neon Wolf", PRICE_CENTS: "3500" })).toEqual({
      action: "stage_listing",
      charges: false,
      imageFrom: "art",
      inventory: null,
      key: "neon-wolf-tee",
      kind: "physical",
      name: "Neon Wolf Tee",
      priceCents: 3500,
      requiresOwnerApproval: true,
    });
    expect(listingKey("  Café Édition #2 !! ")).toBe("caf-dition-2");
  });
});

describe("bundled commerce recipes", () => {
  for (const slug of ["merch-drop", "event-ticket"]) {
    it(`${slug} plans with zero credentials and quotes the commerce step at $0`, () => {
      const output = JSON.parse(execFileSync(process.execPath, [cli, "run", slug, "--json"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, CONVEX_URL: "", FAL_KEY: "", GMI_API_KEY: "", NEXT_PUBLIC_CONVEX_URL: "" },
      }));
      expect(output).toMatchObject({ live: false, mode: "plan", status: "planned", zap: slug });
      const [media, commerce] = output.steps;
      expect(media.kind).toBe("image.gen");
      expect(commerce).toMatchObject({
        kind: "commerce.stage_listing",
        provider: "air",
        quoteUsd: 0,
        status: "planned",
        wouldStage: { charges: false, requiresOwnerApproval: true, kind: slug === "merch-drop" ? "physical" : "event_ticket" },
      });
      expect(output.quoteUsd).toBe(media.quoteUsd);
      expect(output.zapUrl).toBeUndefined();
    });
  }
});

describe("commerce live executor", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it("resolves the air gateway from the box convention but never reuses a plain OpenAI key", () => {
    const home = mkdtempSync(path.join(tmpdir(), "zap-home-"));
    cleanups.push(() => rmSync(home, { force: true, recursive: true }));
    expect(resolveCommerceEnvironment({ OPENAI_API_KEY: "sk-real", OPENAI_BASE_URL: "https://api.openai.com/v1" }, home)).toEqual({
      apiBase: undefined,
      catalogPath: path.join(home, ".hermes", "miniapps", "shop", "catalog.json"),
      token: undefined,
    });
    expect(resolveCommerceEnvironment({
      OPENAI_API_KEY: "gw_token",
      OPENAI_BASE_URL: "https://app.wzrd.tech/api/gateway/v1/",
    }, home)).toMatchObject({ apiBase: "https://app.wzrd.tech", token: "gw_token" });
    expect(resolveCommerceEnvironment({
      ZAP_AIR_API_BASE: "http://localhost:3000/",
      ZAP_AIR_CATALOG_PATH: "~/shop.json",
      ZAP_AIR_GATEWAY_TOKEN: "t",
    }, home)).toEqual({ apiBase: "http://localhost:3000", catalogPath: path.join(home, "shop.json"), token: "t" });
  });

  it("builds a sanitizer-compatible catalog entry and rejects unresolved prices", () => {
    const spec = parseZapMarkdown(recipe(merchSteps));
    const step = spec.steps[1]!;
    expect(buildCatalogEntry(step, { NAME: "Neon Wolf", PRICE_CENTS: "3500", STOCK: "100" }, {
      imageUrl: "https://media.wzrd.tech/u/casey/media/art.png",
      runId: "run_1",
      zap: "commerce-demo",
    })).toEqual({
      active: true,
      description: "Drop for Neon Wolf",
      imageUrl: "https://media.wzrd.tech/u/casey/media/art.png",
      inventory: 100,
      key: "neon-wolf-tee",
      kind: "physical",
      name: "Neon Wolf Tee",
      priceCents: 3500,
      source: { runId: "run_1", stepId: "listing", zap: "commerce-demo" },
    });
    expect(() => buildCatalogEntry(step, { NAME: "X" }, { imageUrl: null, runId: "r", zap: "z" })).toThrow(/priceCents/);
    expect(() => buildCatalogEntry(step, { NAME: "X", PRICE_CENTS: "12.5" }, { imageUrl: null, runId: "r", zap: "z" })).toThrow(/priceCents/);
  });

  it("merges into catalog.json by key and files publish_catalog only after the write", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "zap-home-"));
    cleanups.push(() => rmSync(home, { force: true, recursive: true }));
    const catalogPath = path.join(home, "catalog.json");
    writeFileSync(catalogPath, JSON.stringify({ items: [{ key: "zine", kind: "digital", name: "Zine", priceCents: 800 }] }));

    const requests: Array<{ authorization?: string; body: unknown; url?: string }> = [];
    const server = createServer((request, response) => {
      let raw = "";
      request.on("data", (chunk) => { raw += chunk; });
      request.on("end", () => {
        requests.push({ authorization: request.headers.authorization, body: JSON.parse(raw), url: request.url });
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ decisionId: "dec_1", ok: true, staged: true }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => server.close());
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const environment = { apiBase: `http://127.0.0.1:${address.port}`, catalogPath, token: "gw_token" };

    const spec = parseZapMarkdown(recipe(merchSteps));
    const result = await stageListing({
      environment,
      imageAsset: "https://media.wzrd.tech/u/casey/media/art.png",
      inputs: { NAME: "Neon Wolf", PRICE_CENTS: "3500" },
      runId: "run_1",
      spec,
      step: spec.steps[1]!,
    });
    expect(result).toMatchObject({ charges: false, decisionId: "dec_1", decisionReused: false, replaced: false, status: "staged" });
    expect(requests).toEqual([{
      authorization: "Bearer gw_token",
      body: { action: "publish_catalog" },
      url: "/api/miniapps/commerce",
    }]);
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    expect(catalog.items.map((item: { key: string }) => item.key)).toEqual(["zine", "neon-wolf-tee"]);
    expect(catalog.items[1]).toMatchObject({ inventory: null, kind: "physical", priceCents: 3500 });

    const again = await upsertCatalogEntry(catalogPath, { ...catalog.items[1], priceCents: 4000 });
    expect(again.replaced).toBe(true);
    expect(again.catalog.items).toHaveLength(2);
  });

  it("refuses to stage when no air gateway is configured", async () => {
    const spec = parseZapMarkdown(recipe(merchSteps));
    await expect(stageListing({
      environment: { apiBase: undefined, catalogPath: path.join(tmpdir(), "never.json"), token: undefined },
      inputs: { NAME: "X", PRICE_CENTS: "100" },
      runId: "r",
      spec,
      step: spec.steps[1]!,
    })).rejects.toMatchObject({ code: "COMMERCE_UNCONFIGURED" });
  });
});
