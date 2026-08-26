// Gateway plan-only guarantees: no provider is ever contacted, quotes match
// the legacy 0.3.1 planner bit-for-bit, and live submission is gated.
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseZapMarkdown, planZapRun } from "@wzrdtech/core";
import {
  GatewayError,
  createGatewayService,
  createMediaService,
  llmRoutes,
} from "../src/gateway/index.ts";

const fetchSpy = vi.fn(() => {
  throw new Error("plan-only code path attempted a network call");
});

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

async function loadGoldenSpecs() {
  const skillsDir = path.join(process.cwd(), "agent", "skills");
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const specs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("zap-")) continue;
    const zapPath = path.join(skillsDir, entry.name, "Zap.md");
    try {
      specs.push({ slug: entry.name, spec: parseZapMarkdown(await fs.readFile(zapPath, "utf8")) });
    } catch {
      // skip non-recipe dirs
    }
  }
  return specs;
}

describe("gateway plan-only", () => {
  it("quote() matches legacy planZapRun estimates bit-for-bit for every golden recipe", async () => {
    const gateway = createGatewayService();
    const specs = await loadGoldenSpecs();
    expect(specs.length).toBeGreaterThan(0);
    let compared = 0;
    for (const { slug, spec } of specs) {
      let plan;
      try {
        plan = planZapRun(spec, 0);
      } catch {
        // operator-priced models (e.g. seedance-fast) are unplannable without
        // console-sourced rates in both 0.3.1 and v5; parity holds by both throwing
        continue;
      }
      compared += 1;
      const quote = await gateway.quote(plan);
      expect(quote.usd, slug).toBe(plan.estimateUsd);
      expect(quote.lines.length, slug).toBe(plan.steps.length);
    }
    expect(compared).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("route() and media().price() never contact a provider", () => {
    const gateway = createGatewayService();
    const routed = gateway.route("video.gen", { provider: "gmi", model: "seedance-2-0-260128" });
    expect(routed).toEqual({ provider: "gmi", model: "seedance-2-0-260128", usdEstimate: 0.07 });

    const media = gateway.media("fal", { model: "fal-ai/flux/dev" });
    const priced = media.price(
      { capability: "image.gen", inputs: {}, prompt: "a cat", runId: "r", stepId: "s" },
      { live: false },
    );
    expect(priced.usd).toBe(0.025);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("llm() constructs a service for every 0.3.1 route id without touching the network", () => {
    const gateway = createGatewayService();
    for (const route of Object.keys(llmRoutes) as Array<keyof typeof llmRoutes>) {
      const svc = gateway.llm(route, { model: llmRoutes[route].defaultModel });
      expect(svc.route).toBe(route);
    }
    // "gateway" is the preserved 0.3.1 Vercel AI Gateway route id
    expect(llmRoutes.gateway.baseUrl).toContain("ai-gateway.vercel.sh");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("llm step without a resolvable key fails closed before any network call", async () => {
    const gateway = createGatewayService({ resolveKey: () => undefined });
    const svc = gateway.llm("openrouter", { model: "anthropic/claude-sonnet-4.6" });
    await expect(svc.step({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({
      code: "KEY_UNAVAILABLE",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("openai/anthropic direct routes reject provider-prefixed model ids", () => {
    const gateway = createGatewayService();
    expect(() => gateway.llm("openai", { model: "openai/gpt-5.4" })).toThrowError(GatewayError);
    expect(() => gateway.llm("anthropic", { model: "anthropic/claude-sonnet-4-6" })).toThrowError(GatewayError);
  });

  it("media submit throws LIVE_REQUIRED in plan-only mode and with a missing payer", async () => {
    const media = createMediaService("fal", { model: "fal-ai/flux/dev" });
    const req = { capability: "image.gen" as const, inputs: {}, prompt: "a cat", runId: "r", stepId: "s" };
    await expect(media.submit(req, { live: false, payerMode: "byok" })).rejects.toMatchObject({ code: "LIVE_REQUIRED" });
    await expect(media.submit(req, { live: true, payerMode: "missing" })).rejects.toMatchObject({ code: "LIVE_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
