import { execFile, execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  assertCommerceEnvironment,
  buildCatalogEntry,
  publishListingImage,
  readCatalogDocument,
  resolveCommerceEnvironment,
  resolvePublishableImage,
  stageListing,
  stagePaymentRequest,
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

  it("only accepts image-typed user inputs as listing.image", () => {
    for (const [input, type] of [["NAME", "string"], ["PRICE_CENTS", "number"], ["clip", "video"]] as const) {
      expect(() => parseZapMarkdown(recipe(`  - id: listing
    kind: commerce.stage_listing
    listing: { kind: digital, name: X, priceCents: 100, image: user.${input} }
`, "  clip: { type: video, required: false }\n"))).toThrow(new RegExp(`user\\.${input}, which is a ${type} input`));
    }
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
      mediaBase: "https://media.wzrd.tech",
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
    }, home)).toEqual({ apiBase: "http://localhost:3000", catalogPath: path.join(home, "shop.json"), mediaBase: "https://media.wzrd.tech", token: "t" });
    expect(resolveCommerceEnvironment({ ZAP_AIR_MEDIA_BASE: "https://cdn.example/" }, home)).toMatchObject({ mediaBase: "https://cdn.example" });
  });

  it("never sends the box gateway token to an overridden API base", () => {
    const home = mkdtempSync(path.join(tmpdir(), "zap-home-"));
    cleanups.push(() => rmSync(home, { force: true, recursive: true }));
    const box = { OPENAI_API_KEY: "gw_token", OPENAI_BASE_URL: "https://app.wzrd.tech/api/gateway/v1" };
    expect(resolveCommerceEnvironment({ ...box, ZAP_AIR_API_BASE: "https://evil.example" }, home)).toMatchObject({
      apiBase: "https://evil.example",
      token: undefined,
    });
    expect(resolveCommerceEnvironment({ ...box, ZAP_AIR_API_BASE: "https://app.wzrd.tech/" }, home)).toMatchObject({
      apiBase: "https://app.wzrd.tech",
      token: "gw_token",
    });
    expect(resolveCommerceEnvironment({ ...box, ZAP_AIR_API_BASE: "https://staging.wzrd.tech", ZAP_AIR_GATEWAY_TOKEN: "other" }, home))
      .toMatchObject({ apiBase: "https://staging.wzrd.tech", token: "other" });
  });

  it("refuses plain-http API bases except loopback", () => {
    const catalogPath = path.join(tmpdir(), "never.json");
    for (const apiBase of ["http://air.example", "http://10.0.0.5:3000", "ftp://app.wzrd.tech", "not a url"]) {
      expect(() => assertCommerceEnvironment({ apiBase, catalogPath, token: "t" })).toThrow(
        expect.objectContaining({ code: "COMMERCE_INSECURE_API_BASE" }),
      );
    }
    for (const apiBase of ["https://app.wzrd.tech", "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
      expect(() => assertCommerceEnvironment({ apiBase, catalogPath, token: "t" })).not.toThrow();
    }
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

  it("treats a missing catalog as empty but refuses to overwrite one it cannot read", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "zap-home-"));
    cleanups.push(() => rmSync(home, { force: true, recursive: true }));
    await expect(readCatalogDocument(path.join(home, "missing", "catalog.json"))).resolves.toEqual({ items: [] });

    const entry = { key: "tee", kind: "physical", name: "Tee", priceCents: 100 } as Parameters<typeof upsertCatalogEntry>[1];
    const malformed = path.join(home, "malformed.json");
    writeFileSync(malformed, '{"items": [{"key": "zine"');
    await expect(upsertCatalogEntry(malformed, entry)).rejects.toMatchObject({ code: "COMMERCE_CATALOG_UNREADABLE" });
    expect(readFileSync(malformed, "utf8")).toBe('{"items": [{"key": "zine"');

    const notObject = path.join(home, "array.json");
    writeFileSync(notObject, "[]");
    await expect(upsertCatalogEntry(notObject, entry)).rejects.toMatchObject({ code: "COMMERCE_CATALOG_UNREADABLE" });

    if (process.getuid?.() !== 0) {
      const unreadable = path.join(home, "unreadable.json");
      writeFileSync(unreadable, JSON.stringify({ items: [{ key: "zine" }] }));
      chmodSync(unreadable, 0o000);
      cleanups.push(() => chmodSync(unreadable, 0o600));
      await expect(upsertCatalogEntry(unreadable, entry)).rejects.toMatchObject({ code: "COMMERCE_CATALOG_UNREADABLE" });
      chmodSync(unreadable, 0o600);
      expect(JSON.parse(readFileSync(unreadable, "utf8")).items).toEqual([{ key: "zine" }]);
    }
  });

  it("keeps every listing when concurrent processes stage into the same catalog", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "zap-home-"));
    cleanups.push(() => rmSync(home, { force: true, recursive: true }));
    const catalogPath = path.join(home, "catalog.json");
    const script = `
      import { upsertCatalogEntry } from ${JSON.stringify(path.resolve(repoRoot, "packages/cli/src/lib/commerce.js"))};
      const key = process.env.ZAP_TEST_KEY;
      await upsertCatalogEntry(process.env.ZAP_TEST_CATALOG, { key, kind: "digital", name: key, priceCents: 100 });
    `;
    const keys = Array.from({ length: 6 }, (_, index) => `item-${index}`);
    const children = keys.map((key) => new Promise<void>((resolve, reject) => {
      execFile(process.execPath, ["--input-type=module", "-e", script], {
        cwd: repoRoot,
        env: { ...process.env, ZAP_TEST_CATALOG: catalogPath, ZAP_TEST_KEY: key },
      }, (error, _stdout, stderr) => {
        if (error) reject(new Error(`${error.message}\n${stderr}`));
        else resolve();
      });
    }));
    await Promise.all(children);
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    expect(catalog.items.map((item: { key: string }) => item.key).sort()).toEqual(keys);
  });

  it("publishes images only from the run, project, and inbox roots", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "zap-home-"));
    cleanups.push(() => rmSync(home, { force: true, recursive: true }));
    const runDir = path.join(home, "project", ".zap", "runs", "run_1");
    const inbox = path.join(home, ".hermes", "inbox");
    mkdirSync(path.join(runDir, "assets"), { recursive: true });
    mkdirSync(inbox, { recursive: true });
    writeFileSync(path.join(runDir, "assets", "art.png"), "png");
    writeFileSync(path.join(inbox, "selfie.jpg"), "jpg");
    writeFileSync(path.join(home, ".hermes", ".env"), "OPENAI_API_KEY=secret");
    writeFileSync(path.join(home, "private.png"), "png");
    const roots = [runDir, path.join(home, "project"), inbox];

    await expect(resolvePublishableImage(path.join(runDir, "assets", "art.png"), roots)).resolves.toEqual({ path: path.join(runDir, "assets", "art.png") });
    await expect(resolvePublishableImage(path.join(inbox, "selfie.jpg"), roots)).resolves.toEqual({ path: path.join(inbox, "selfie.jpg") });
    await expect(resolvePublishableImage(path.join(home, ".hermes", ".env"), roots)).resolves.toMatchObject({ reason: /not a supported image file/ });
    await expect(resolvePublishableImage(path.join(home, "private.png"), roots)).resolves.toMatchObject({ reason: /outside the publishable roots/ });
    await expect(resolvePublishableImage(path.join(runDir, "..", "..", "..", "..", "private.png"), roots)).resolves.toMatchObject({ reason: /outside the publishable roots/ });

    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ url: "https://media.wzrd.tech/u/casey/media/x.png" }), { status: 200 });
    }) as typeof fetch;
    cleanups.push(() => { globalThis.fetch = originalFetch; });
    const environment = { apiBase: "https://app.wzrd.tech", catalogPath: path.join(home, "c.json"), token: "t" };
    await expect(publishListingImage(environment, path.join(home, "private.png"), roots)).resolves.toMatchObject({ imageUrl: null });
    expect(calls).toEqual([]);
    await expect(publishListingImage(environment, path.join(runDir, "assets", "art.png"), roots)).resolves.toMatchObject({
      imageUrl: "https://media.wzrd.tech/u/casey/media/x.png",
    });
    expect(calls).toEqual(["https://app.wzrd.tech/api/media/publish"]);

    // Remote URLs pass through only when air would keep them.
    await expect(publishListingImage(environment, "https://media.wzrd.tech/u/casey/media/y.png", roots)).resolves.toMatchObject({
      imageUrl: "https://media.wzrd.tech/u/casey/media/y.png",
    });
    await expect(publishListingImage(environment, "https://evil.example/y.png", roots)).resolves.toMatchObject({ imageUrl: null, note: /air keeps only https:\/\/media\.wzrd\.tech/ });
    await expect(publishListingImage({ ...environment, mediaBase: "https://cdn.example" }, "https://cdn.example/y.png", roots)).resolves.toMatchObject({
      imageUrl: "https://cdn.example/y.png",
    });
    expect(calls).toHaveLength(1);
  });

  it("a lost payment_request reply is never retried and is reported as possibly filed", async () => {
    const attempts: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string | URL | Request) => {
      attempts.push(String(url));
      return Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    }) as typeof fetch;
    cleanups.push(() => { globalThis.fetch = originalFetch; });
    const spec = parseZapMarkdown(recipe(`
  - id: pay
    kind: commerce.payment_request
    payment_request:
      amount: user.AMOUNT
      payee: "{PAYEE}"
`, "  AMOUNT: { type: number, required: true }\n  PAYEE: { type: string, required: true }\n"));
    await expect(stagePaymentRequest({
      environment: { apiBase: "https://app.wzrd.tech", catalogPath: path.join(tmpdir(), "never.json"), token: "t" },
      inputs: { AMOUNT: 25, PAYEE: "studio" },
      step: spec.steps[0]!,
    })).rejects.toMatchObject({
      code: "COMMERCE_STAGE_TIMEOUT",
      message: /may have filed the decision/,
      remediation: /Check Needs you.*before staging it again/,
      retryable: false,
    });
    expect(attempts).toEqual(["https://app.wzrd.tech/api/miniapps/commerce"]);
  });

  it("a payment_request whose connection drops without a reply is not called retryable either", async () => {
    // 200 headers arrive, then the socket dies before the body: the request
    // reached air, so a repeat could file a second request.
    const server = createServer((request, response) => {
      request.on("data", () => {});
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.write("{");
        response.flushHeaders();
        setTimeout(() => request.socket.destroy(), 20);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    cleanups.push(() => server.close());
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no address");
    const environment = { apiBase: `http://127.0.0.1:${address.port}`, catalogPath: path.join(tmpdir(), "never.json"), token: "t" };
    const spec = parseZapMarkdown(recipe(`
  - id: pay
    kind: commerce.payment_request
    payment_request:
      amount: user.AMOUNT
      payee: "{PAYEE}"
`, "  AMOUNT: { type: number, required: true }\n  PAYEE: { type: string, required: true }\n"));
    await expect(stagePaymentRequest({ environment, inputs: { AMOUNT: 25, PAYEE: "studio" }, step: spec.steps[0]! })).rejects.toMatchObject({
      code: "COMMERCE_STAGE_FAILED",
      message: /may have filed the decision before the connection dropped/,
      remediation: /Check Needs you.*before staging it again/,
      retryable: false,
    });
  });

  it("a 200 whose body times out is a lost reply, not a staged listing", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "zap-home-"));
    cleanups.push(() => rmSync(home, { force: true, recursive: true }));
    let bodyReads = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      text: async () => {
        bodyReads += 1;
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      },
    })) as unknown as typeof fetch;
    cleanups.push(() => { globalThis.fetch = originalFetch; });
    const spec = parseZapMarkdown(recipe(merchSteps));
    await expect(stageListing({
      environment: { apiBase: "https://app.wzrd.tech", catalogPath: path.join(home, "catalog.json"), token: "t" },
      inputs: { NAME: "X", PRICE_CENTS: "100" },
      runId: "r",
      spec,
      step: spec.steps[1]!,
    })).rejects.toMatchObject({ code: "COMMERCE_STAGE_TIMEOUT", message: /2 attempts/, retryable: true });
    expect(bodyReads).toBe(2);
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
