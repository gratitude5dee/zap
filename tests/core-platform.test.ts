import { describe, expect, it } from "vitest";
import { planZapRun } from "../packages/core/src/planner";
import { parseZapMarkdown } from "../packages/core/src/schema";
import { listProviderAdapters } from "@wzrdtech/providers";

describe("platform core", () => {
  it("parses HyperFrames stitch settings", () => {
    const zap = parseZapMarkdown(`---
zap: hyperframes-demo
version: 2
description: demo
inputs:
  initial_gen: { type: video, required: false }
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
version: 2
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
version: 2
description: demo
budget:
  estimate_usd: 0
  cap_usd: 1
steps:
  - id: extend
    kind: video.extend
    duration_s: 5
    model: seedance-2-0-260128
    repeat:
      max: 2
  - id: stitch
    kind: stitch
---
`);

    const plan = planZapRun(zap, 5);
    expect(plan.steps.map((step) => step.id)).toEqual(["extend_1", "extend_2", "stitch"]);
  });

  it("exports only live BYOK provider adapters", () => {
    expect(listProviderAdapters().map((adapter) => adapter.id).sort()).toEqual(["fal", "gmi", "prodia", "runware"]);
  });
});
