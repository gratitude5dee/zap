import type { MediaKind } from "../mediafs/schema.ts";

export interface FfmpegProbe {
  durationS?: number;
  width?: number;
  height?: number;
}

/**
 * Presets are data: argv is deterministic given inputs + params, the estimate
 * is pure over the probe, and execution only happens through the ffmpeg lane.
 */
export interface FfmpegPreset {
  id: string;
  outputs: { kind: MediaKind; ext: string; mime: string };
  argv(inputs: readonly string[], params?: Record<string, string | number>): string[];
  estimateCpuSeconds(probe: FfmpegProbe): number;
}

const BASE = ["ffmpeg", "-hide_banner", "-y"] as const;

function inputArgs(inputs: readonly string[]): string[] {
  return inputs.flatMap((input) => ["-i", input]);
}

function out(params: Record<string, string | number> | undefined, ext: string): string {
  return String(params?.output ?? `output.${ext}`);
}

export const ffmpegPresets: Record<string, FfmpegPreset> = {
  "transcode-h264": {
    id: "transcode-h264",
    outputs: { kind: "video", ext: "mp4", mime: "video/mp4" },
    argv(inputs, params) {
      return [...BASE, ...inputArgs(inputs), "-c:v", "libx264", "-preset", "medium", "-crf", String(params?.crf ?? 23), "-c:a", "aac", out(params, "mp4")];
    },
    estimateCpuSeconds(probe) {
      return 2 + 1.5 * (probe.durationS ?? 1);
    },
  },
  "extract-audio": {
    id: "extract-audio",
    outputs: { kind: "audio", ext: "mp3", mime: "audio/mpeg" },
    argv(inputs, params) {
      return [...BASE, ...inputArgs(inputs), "-vn", "-c:a", "libmp3lame", "-q:a", "2", out(params, "mp3")];
    },
    estimateCpuSeconds(probe) {
      return 1 + 0.2 * (probe.durationS ?? 1);
    },
  },
  thumbnail: {
    id: "thumbnail",
    outputs: { kind: "image", ext: "png", mime: "image/png" },
    argv(inputs, params) {
      return [...BASE, ...inputArgs(inputs), "-ss", String(params?.atS ?? 0), "-frames:v", "1", out(params, "png")];
    },
    estimateCpuSeconds() {
      return 1;
    },
  },
  trim: {
    id: "trim",
    outputs: { kind: "video", ext: "mp4", mime: "video/mp4" },
    argv(inputs, params) {
      return [...BASE, ...inputArgs(inputs), "-ss", String(params?.fromS ?? 0), "-t", String(params?.durationS ?? 1), "-c", "copy", out(params, "mp4")];
    },
    estimateCpuSeconds(probe) {
      return 0.5 + 0.05 * (probe.durationS ?? 1);
    },
  },
  "scale-720p": {
    id: "scale-720p",
    outputs: { kind: "video", ext: "mp4", mime: "video/mp4" },
    argv(inputs, params) {
      return [...BASE, ...inputArgs(inputs), "-vf", "scale=-2:720", "-c:v", "libx264", "-crf", "23", "-c:a", "copy", out(params, "mp4")];
    },
    estimateCpuSeconds(probe) {
      return 2 + 1.2 * (probe.durationS ?? 1);
    },
  },
  stitch: {
    id: "stitch",
    outputs: { kind: "video", ext: "mp4", mime: "video/mp4" },
    argv(inputs, params) {
      const filter = `${inputs.map((_, i) => `[${i}:v][${i}:a]`).join("")}concat=n=${inputs.length}:v=1:a=1[v][a]`;
      return [...BASE, ...inputArgs(inputs), "-filter_complex", filter, "-map", "[v]", "-map", "[a]", out(params, "mp4")];
    },
    estimateCpuSeconds(probe) {
      return 3 + 2 * (probe.durationS ?? 1);
    },
  },
  overlay: {
    id: "overlay",
    outputs: { kind: "video", ext: "mp4", mime: "video/mp4" },
    argv(inputs, params) {
      return [...BASE, ...inputArgs(inputs), "-filter_complex", `overlay=${String(params?.x ?? 0)}:${String(params?.y ?? 0)}`, out(params, "mp4")];
    },
    estimateCpuSeconds(probe) {
      return 2 + 1.8 * (probe.durationS ?? 1);
    },
  },
  "gen-media-post": {
    id: "gen-media-post",
    outputs: { kind: "video", ext: "mp4", mime: "video/mp4" },
    argv(inputs, params) {
      return [...BASE, ...inputArgs(inputs), "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", "-c:a", "aac", out(params, "mp4")];
    },
    estimateCpuSeconds(probe) {
      return 2 + 1.5 * (probe.durationS ?? 1);
    },
  },
};

export function getFfmpegPreset(id: string): FfmpegPreset | undefined {
  return ffmpegPresets[id];
}

export function listFfmpegPresets(): FfmpegPreset[] {
  return Object.values(ffmpegPresets);
}
