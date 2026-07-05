import { describe, expect, it } from "vitest";
import { buildIdempotencyKey, quoteGeneration } from "../lib/providers/router";

describe("provider router", () => {
  it("quotes known GMI video models", () => {
    const quote = quoteGeneration({
      capability: "video.gen",
      durationS: 15,
      inputs: {},
      model: "seedance-2-0-260128",
      prompt: "test",
      provider: "gmi",
      runId: "run_test",
      stepId: "initial_gen",
    });
    expect(quote).toBeCloseTo(1.05);
  });

  it("quotes fal image models", () => {
    const quote = quoteGeneration({
      capability: "image.gen",
      inputs: {},
      model: "fal-ai/flux/dev",
      prompt: "test",
      provider: "fal",
      runId: "run_test",
      stepId: "frame",
    });
    expect(quote).toBeCloseTo(0.03);
  });

  it("builds stable idempotency keys for equivalent generation requests", () => {
    const req = {
      capability: "video.gen" as const,
      durationS: 15,
      inputs: { NAME: "Ada" },
      model: "seedance-2-0-260128",
      prompt: "test",
      provider: "gmi" as const,
      runId: "run_test",
      stepId: "initial_gen",
    };

    expect(buildIdempotencyKey(req)).toBe(buildIdempotencyKey({ ...req }));
  });

  it("rejects mock provider at runtime", () => {
    expect(() => quoteGeneration({
      capability: "video.gen",
      durationS: 15,
      inputs: {},
      model: "anything",
      prompt: "test",
      provider: "mock" as never,
      runId: "run_test",
      stepId: "initial_gen",
    })).toThrow(/mock/);
  });
});
