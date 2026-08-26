// Deterministic media router: 0.3.1-compatible selection, mode-aware pricing,
// replicate registration, and stable idempotency keys.
import { describe, expect, it } from "vitest";
import {
  RouterError,
  buildIdempotencyKey,
  listCapabilityManifest,
  quoteGeneration,
  quoteGenerationForMode,
  selectAdapter,
  selectProviderById,
} from "../src/gateway/router.ts";

const baseReq = {
  capability: "image.gen" as const,
  inputs: {},
  prompt: "a cat",
  runId: "run-1",
  stepId: "step-1",
};

describe("deterministic router", () => {
  it("selects the same adapter for the same provider/model pair (0.3.1 parity)", () => {
    for (const [provider, model, capability] of [
      ["fal", "fal-ai/flux/dev", "image.gen"],
      ["gmi", "seedance-2-0-260128", "video.gen"],
      ["prodia", "prodia/sdxl", "image.gen"],
      ["runware", "runware:100@1", "image.gen"],
      ["vertex", "imagen-4.0-generate-001", "image.gen"],
      ["aws", "amazon.nova-canvas-v1:0", "image.gen"],
    ] as const) {
      const a = selectAdapter({ ...baseReq, capability, model, provider });
      const b = selectAdapter({ ...baseReq, capability, model, provider });
      expect(a.id).toBe(provider);
      expect(b.id).toBe(provider);
    }
  });

  it("registers replicate as a routable provider", () => {
    expect(selectProviderById("replicate").id).toBe("replicate");
    const adapter = selectAdapter({ ...baseReq, model: "black-forest-labs/flux-dev", provider: "replicate" });
    expect(adapter.id).toBe("replicate");
  });

  it("rejects mock and unknown providers with PROVIDER_UNSUPPORTED", () => {
    expect(() => selectProviderById("mock")).toThrowError(RouterError);
    try {
      selectProviderById("nope");
      expect.unreachable();
    } catch (error) {
      expect((error as RouterError).code).toBe("PROVIDER_UNSUPPORTED");
      expect((error as RouterError).alternatives).toContain("replicate");
    }
  });

  it("quotes known pricing identically to the adapter rate card", () => {
    expect(quoteGeneration({ ...baseReq, model: "fal-ai/flux/dev", provider: "fal" })).toBe(0.025);
    expect(
      quoteGeneration({ ...baseReq, capability: "video.gen", durationS: 5, model: "seedance-2-0-260128", provider: "gmi" }),
    ).toBe(0.07 * 5);
  });

  it("unknown pricing: PRICE_UNKNOWN in live mode, { usd: 0, warning } in plan-only", () => {
    const req = { ...baseReq, model: "black-forest-labs/some-unpriced-model", provider: "replicate" };
    try {
      quoteGenerationForMode(req, { live: true });
      expect.unreachable();
    } catch (error) {
      expect((error as RouterError).code).toBe("PRICE_UNKNOWN");
    }
    const planned = quoteGenerationForMode(req, { live: false });
    expect(planned.usd).toBe(0);
    expect(planned.warning).toContain("black-forest-labs/some-unpriced-model");
  });

  it("keeps 0.3.1 UNKNOWN_MODEL semantics on the legacy quote path", () => {
    try {
      quoteGeneration({ ...baseReq, model: "black-forest-labs/some-unpriced-model", provider: "replicate" });
      expect.unreachable();
    } catch (error) {
      expect((error as RouterError).code).toBe("UNKNOWN_MODEL");
    }
  });

  it("capability manifest is deterministic and includes local ffmpeg lanes", () => {
    const first = listCapabilityManifest();
    const second = listCapabilityManifest();
    expect(second).toEqual(first);
    expect(first.some((entry) => entry.capability === "stitch" && entry.provider === "local")).toBe(true);
    expect(first.some((entry) => entry.capability === "keyframes" && entry.provider === "local")).toBe(true);
  });

  it("idempotency keys are stable for identical requests and distinct for different inputs", () => {
    const req = { ...baseReq, model: "fal-ai/flux/dev", provider: "fal" };
    const a = buildIdempotencyKey(req);
    const b = buildIdempotencyKey({ ...req });
    expect(a).toBe(b);
    expect(a).toMatch(/^zap:idem:run-1:step-1:[0-9a-f]{16}$/);
    expect(buildIdempotencyKey({ ...req, prompt: "a dog" })).not.toBe(a);
    expect(buildIdempotencyKey({ ...req, attemptSalt: "retry-2" })).toBe("zap:idem:run-1:step-1:retry-2");
  });
});
