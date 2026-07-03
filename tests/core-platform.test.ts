import { describe, expect, it } from "vitest";
import { mockAdapter } from "../lib/providers/mock";
import { planZapRun } from "../packages/core/src/planner";
import { parseZapMarkdown } from "../packages/core/src/schema";

describe("platform core", () => {
  it("parses HyperFrames stitch settings", () => {
    const zap = parseZapMarkdown(`---
zap: hyperframes-demo
version: 1
description: demo
budget:
  estimate_usd: 0
  cap_usd: 1
steps:
  - id: stitch
    kind: stitch
    inputs: [initial_gen]
    stitch:
      engine: hyperframes
      quality: high
      format: mp4
---
`);

    expect(zap.steps[0]?.stitch?.engine).toBe("hyperframes");
  });

  it("rejects duplicate step ids", () => {
    expect(() => parseZapMarkdown(`---
zap: duplicate-demo
version: 1
description: demo
budget:
  estimate_usd: 0
  cap_usd: 1
steps:
  - id: frame
    kind: image.gen
  - id: frame
    kind: video.gen
---
`)).toThrow(/Duplicate step id/);
  });

  it("plans repeated extension steps within max", () => {
    const zap = parseZapMarkdown(`---
zap: repeat-demo
version: 1
description: demo
budget:
  estimate_usd: 0
  cap_usd: 1
steps:
  - id: extend
    kind: video.extend
    repeat:
      max: 2
  - id: stitch
    kind: stitch
---
`);

    const plan = planZapRun(zap, 5);
    expect(plan.steps.map((step) => step.id)).toEqual(["extend_1", "extend_2", "stitch"]);
  });

  it("returns deterministic mock outputs", async () => {
    const submitted = await mockAdapter.submit({
      capability: "video.gen",
      inputs: {},
      model: "mock-video",
      prompt: "hello",
      provider: "mock",
      runId: "run_test",
      stepId: "initial_gen",
    }, "idem");
    const result = await mockAdapter.poll(submitted.requestId);

    expect(submitted.provider).toBe("mock");
    expect(result.status).toBe("done");
    expect(result.actualUsd).toBe(0);
    expect(result.outputUrl).toContain(submitted.requestId);
  });
});
