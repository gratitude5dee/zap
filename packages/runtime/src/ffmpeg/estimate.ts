import type { FfmpegPreset, FfmpegProbe } from "./presets.ts";

/** Parse the duration (seconds) out of `ffprobe -show_format -print_format json` output. */
export function probeFromFfprobeJson(json: string): FfmpegProbe {
  const parsed = JSON.parse(json) as {
    format?: { duration?: string };
    streams?: Array<{ width?: number; height?: number }>;
  };
  const duration = Number(parsed.format?.duration);
  const video = parsed.streams?.find((s) => s.width !== undefined);
  return {
    durationS: Number.isFinite(duration) ? duration : undefined,
    width: video?.width,
    height: video?.height,
  };
}

/** Pure CPU-seconds estimate for one preset run; monotonic in probe duration. */
export function estimateCpuSeconds(preset: FfmpegPreset, probe: FfmpegProbe): number {
  return preset.estimateCpuSeconds(probe);
}

/** Dry-run: the argv and estimate a run would use, without executing anything. */
export function dryRunPreset(
  preset: FfmpegPreset,
  inputs: readonly string[],
  params: Record<string, string | number> | undefined,
  probe: FfmpegProbe,
): { argv: string[]; estimateCpuSeconds: number } {
  return { argv: preset.argv(inputs, params), estimateCpuSeconds: preset.estimateCpuSeconds(probe) };
}
