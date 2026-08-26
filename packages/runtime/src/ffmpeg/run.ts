import type { LaneExecutor } from "@wzrdtech/zap-sandbox";
import type { MediaFs, MediaSidecar } from "../mediafs/index.ts";
import type { FfmpegPreset } from "./presets.ts";

export interface FfmpegRunResult {
  execution: Awaited<ReturnType<LaneExecutor["run"]>>;
  media?: { sha256: string; path: string };
}

/**
 * Execute a preset through the ffmpeg lane. This is the only execution path
 * for presets; the result bytes are read back and written into the media FS
 * with ffmpegPreset recorded in the sidecar.
 */
export async function runFfmpegPreset(options: {
  lane: LaneExecutor;
  preset: FfmpegPreset;
  inputs: readonly string[];
  params?: Record<string, string | number>;
  readOutput?(outputPath: string): Promise<Uint8Array | null>;
  mediafs?: MediaFs;
  sidecar?: Partial<Omit<MediaSidecar, "schema" | "sha256" | "kind" | "mime" | "bytes" | "createdAt" | "ffmpegPreset">>;
  signal?: AbortSignal;
}): Promise<FfmpegRunResult> {
  const { lane, preset } = options;
  const argv = preset.argv(options.inputs, options.params);
  const execution = await lane.run({ argv, lane: "ffmpeg", signal: options.signal });

  if (execution.exitCode !== 0 || !options.mediafs || !options.readOutput) {
    return { execution };
  }

  const outputPath = argv[argv.length - 1] ?? "";
  const bytes = await options.readOutput(outputPath);
  if (bytes === null) return { execution };

  const media = await options.mediafs.put(preset.outputs.kind, bytes, {
    schema: 1,
    sha256: "",
    kind: preset.outputs.kind,
    mime: preset.outputs.mime,
    bytes: bytes.byteLength,
    createdAt: new Date().toISOString(),
    ffmpegPreset: preset.id,
    ...options.sidecar,
  });
  return { execution, media };
}
