import { describe, expect, it } from "vitest";
import { parseZapMarkdown } from "../lib/zap-schema";

describe("Zap parser", () => {
  it("parses a valid Zap recipe with future-facing grammar fields", () => {
    const spec = parseZapMarkdown(`---
zap: test-zap
version: 1
description: Test Zap
inputs:
  NAME: { type: string, required: true }
defaults: { provider: gmi, aspect: "16:9" }
budget: { estimate_usd: 1, cap_usd: 5 }
steps:
  - id: frame
    kind: image.gen
    model: fal-ai/flux/dev
    tier: draft
    candidates: 2
    prompt: prompts/frame.md
  - id: extend
    kind: video.extend
    model: seedance-2-0-260128
    duration_s: 15
    repeat: { min: 0, max: 64, default: 0 }
    extend: { mode: anchored }
    keyframes: { count: 4 }
  - id: finalize
    kind: stitch
    inputs: [extend.*]
output: Zap.mp4
---
# Body`);

    expect(spec.zap).toBe("test-zap");
    expect(spec.steps[1]?.extend?.mode).toBe("anchored");
    expect(spec.steps[0]?.candidates).toBe(2);
  });

  it("rejects missing frontmatter", () => {
    expect(() => parseZapMarkdown("# nope")).toThrow(/frontmatter/);
  });

  it("rejects undeclared template variables in executable prompts", () => {
    expect(() => parseZapMarkdown(`---
zap: test-zap
version: 1
description: Test Zap
inputs:
  NAME: { type: string, required: true }
budget: { estimate_usd: 1, cap_usd: 5 }
steps:
  - id: frame
    kind: image.gen
    model: fal-ai/flux/dev
    prompt: "Hello {COUNTRY}"
output: Zap.mp4
---
# Body`)).toThrow(/undeclared input/);
  });

  it("rejects extend repeat bounds over the v1 maximum", () => {
    expect(() => parseZapMarkdown(`---
zap: test-zap
version: 1
description: Test Zap
budget: { estimate_usd: 1, cap_usd: 5 }
steps:
  - id: extend
    kind: video.extend
    model: seedance-2-0-260128
    repeat: { min: 0, max: 65, default: 0 }
output: Zap.mp4
---
# Body`)).toThrow();
  });
});
