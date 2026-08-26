// FFmpeg presets are data: stable argv fixtures, monotonic CPU estimates,
// execution only through the ffmpeg lane, results recorded into the media FS.
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LaneExecutor, LaneRun } from "@wzrdtech/zap-sandbox";
import { dryRunPreset, estimateCpuSeconds, probeFromFfprobeJson } from "../src/ffmpeg/estimate.ts";
import { ffmpegPresets, getFfmpegPreset, listFfmpegPresets } from "../src/ffmpeg/presets.ts";
import { runFfmpegPreset } from "../src/ffmpeg/run.ts";
import { createMediaFs } from "../src/mediafs/index.ts";

function fakeLane(exitCode = 0): { lane: LaneExecutor; runs: LaneRun[] } {
  const runs: LaneRun[] = [];
  const now = new Date().toISOString();
  return {
    runs,
    lane: {
      allowed: (lane, argv0) => lane === "ffmpeg" && argv0 === "ffmpeg",
      async run(r) {
        runs.push(r);
        return {
          id: "lane-1",
          lane: r.lane,
          isolation: "process",
          exitCode,
          stdout: "",
          stderr: "",
          timedOut: false,
          truncated: false,
          startedAt: now,
          finishedAt: now,
          usage: { bytesIn: 0, bytesOut: 0 },
        };
      },
    },
  };
}

describe("ffmpeg presets", () => {
  it("every preset dry-runs to a stable argv fixture", () => {
    const argvByPreset = Object.fromEntries(
      listFfmpegPresets().map((preset) => [
        preset.id,
        dryRunPreset(preset, ["in-0.mp4", "in-1.mp4"], { output: "out.bin" }, { durationS: 10 }).argv,
      ]),
    );
    expect(argvByPreset).toMatchSnapshot();
    // determinism: a second call produces the identical argv
    for (const preset of listFfmpegPresets()) {
      expect(preset.argv(["in-0.mp4", "in-1.mp4"], { output: "out.bin" })).toEqual(argvByPreset[preset.id]);
    }
  });

  it("CPU estimates are monotonic in duration for every preset", () => {
    for (const preset of listFfmpegPresets()) {
      let prev = -Infinity;
      for (const durationS of [1, 5, 30, 120, 600]) {
        const estimate = estimateCpuSeconds(preset, { durationS });
        expect(estimate, `${preset.id}@${durationS}`).toBeGreaterThanOrEqual(prev);
        expect(estimate).toBeGreaterThan(0);
        prev = estimate;
      }
    }
  });

  it("parses ffprobe json into a probe", () => {
    const probe = probeFromFfprobeJson(
      JSON.stringify({ format: { duration: "12.5" }, streams: [{ width: 1920, height: 1080 }] }),
    );
    expect(probe).toEqual({ durationS: 12.5, width: 1920, height: 1080 });
  });

  it("executes only through the ffmpeg lane and records isolation", async () => {
    const { lane, runs } = fakeLane();
    const preset = getFfmpegPreset("transcode-h264")!;
    const result = await runFfmpegPreset({ lane, preset, inputs: ["in.mp4"] });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.lane).toBe("ffmpeg");
    expect(runs[0]?.argv).toEqual(preset.argv(["in.mp4"], undefined));
    expect(result.execution.isolation).toBe("process");
    expect(result.media).toBeUndefined();
  });

  it("writes successful output into the media FS with ffmpegPreset recorded", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zap-ffmpeg-"));
    try {
      const mediafs = createMediaFs({ root });
      const { lane } = fakeLane();
      const preset = getFfmpegPreset("thumbnail")!;
      const bytes = new TextEncoder().encode("fake png");
      const result = await runFfmpegPreset({
        lane,
        preset,
        inputs: ["in.mp4"],
        params: { output: "thumb.png" },
        mediafs,
        readOutput: async () => bytes,
        sidecar: { runId: "run-1" },
      });
      expect(result.media).toBeDefined();
      const got = await mediafs.get(result.media!.sha256);
      expect(got?.sidecar.ffmpegPreset).toBe("thumbnail");
      expect(got?.sidecar.runId).toBe("run-1");
      expect(got?.sidecar.kind).toBe("image");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not write to the media FS when the lane run fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "zap-ffmpeg-fail-"));
    try {
      const mediafs = createMediaFs({ root });
      const { lane } = fakeLane(1);
      const result = await runFfmpegPreset({
        lane,
        preset: ffmpegPresets["extract-audio"]!,
        inputs: ["in.mp4"],
        mediafs,
        readOutput: async () => new Uint8Array([1]),
      });
      expect(result.media).toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
