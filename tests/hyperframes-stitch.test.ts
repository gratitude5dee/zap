import { basename } from "node:path";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildHyperframesCompositionHtml,
  renderHyperframesStitch,
  type HyperframesCommandRunner,
} from "../lib/hyperframes-stitch";
import type { ZapStep } from "../lib/zap-schema";

const stitchStep: ZapStep = {
  id: "stitch",
  inputs: ["initial_gen"],
  kind: "stitch",
  stitch: {
    engine: "hyperframes",
    format: "mp4",
    quality: "draft",
  },
};

describe("HyperFrames stitch runtime", () => {
  it("builds deterministic HyperFrames composition HTML", () => {
    const html = buildHyperframesCompositionHtml({
      assetUrls: ["https://cdn.example.com/a.mp4", "https://cdn.example.com/b.png?token=one&two=2"],
      clipDurationS: 12,
    });

    expect(html).toContain('data-composition-id="zap-stitch"');
    expect(html).toContain('data-duration="24"');
    expect(html).toContain("muted playsinline");
    expect(html).toContain("<audio");
    expect(html).toContain("b.png?token=one&amp;two=2");
    expect(html).not.toContain("<template");
    expect(html).not.toContain("Math.random");
    expect(html).not.toContain("Date.now");
    expect(html).toContain('window.__timelines["zap-stitch"]');
  });

  it("falls back to local stitching when HyperFrames is unavailable", async () => {
    const result = await renderHyperframesStitch({
      assetUrls: ["https://cdn.example.com/a.mp4"],
      commandRunner: async () => ({ status: 1, stderr: "command not found" }),
      runId: "run_test",
      step: stitchStep,
    });

    expect(result.engine).toBe("local");
    expect(result.assetUrl).toBe("https://cdn.example.com/a.mp4");
    expect(result.error).toMatch(/unavailable/);
  });

  it("runs lint, validate, inspect, and render before persisting output", async () => {
    const calls: string[][] = [];
    const commandRunner: HyperframesCommandRunner = async (args) => {
      calls.push(args);
      if (args[1] === "render") {
        const output = args[args.indexOf("--output") + 1];
        await writeFile(output, "rendered");
      }
      return { status: 0, stdout: "ok" };
    };

    const result = await renderHyperframesStitch({
      assetUrls: ["https://cdn.example.com/a.mp4"],
      commandRunner,
      persistLocalAsset: async (filePath, key) => ({
        storageKey: key,
        url: `mock://${basename(filePath)}`,
      }),
      runId: "run_test",
      step: stitchStep,
    });

    expect(result.engine).toBe("hyperframes");
    expect(result.assetUrl).toBe("mock://Zap.mp4");
    expect(calls.map((args) => args[1])).toEqual(["--version", "lint", "validate", "inspect", "render"]);
  });
});
