import type { LaneId } from "@wzrdtech/zap-sandbox";

/**
 * Per-lane binary allowlists (goal.md §4.6). A lane runs exactly one argv
 * whose argv[0] must be on its list; anything else is refused with exit 126
 * before any process starts. GPU lanes (`gpu:*`) are session G's gpu.ts.
 */
export const LANE_ALLOWLISTS: Record<Exclude<LaneId, `gpu:${string}`>, readonly string[]> = {
  codegen: ["node", "npm", "npx", "bun", "python3", "pip3", "git", "tsc", "esbuild"],
  ffmpeg: ["ffmpeg", "ffprobe"],
  "media-workflows": ["ffmpeg", "ffprobe", "convert", "magick", "sox", "exiftool"],
  browser: ["chromium", "chromium-browser", "google-chrome", "playwright", "browser-use"],
  wasm: ["wasmtime", "hyperlight-wasm"],
};

export function laneAllowlist(lane: LaneId): readonly string[] {
  if (lane.startsWith("gpu:")) return [];
  return LANE_ALLOWLISTS[lane as Exclude<LaneId, `gpu:${string}`>] ?? [];
}

export function isLaneAllowed(lane: LaneId, argv0: string): boolean {
  const base = argv0.split("/").pop() ?? argv0;
  return laneAllowlist(lane).includes(base);
}
