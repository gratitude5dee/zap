import { execFile } from "node:child_process";
import { Buffer } from "node:buffer";
import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { persistDataUrlAsset, persistLocalFileAsset } from "./blob-store";
import { renderHyperframesStitch } from "./hyperframes-stitch";
import { ZapRunError } from "./zap-errors";
import type { ZapStep } from "./zap-schema";

const execFileAsync = promisify(execFile);

export type LocalMediaResult = {
  durationS?: number;
  height?: number;
  kind: "mp4" | "png" | "wav" | "json";
  parents: string[];
  storageKey?: string;
  url: string;
  width?: number;
};

export async function executeLocalMediaStep({
  inputUrls,
  runId,
  step,
}: {
  inputUrls: string[];
  runId: string;
  step: ZapStep;
}): Promise<LocalMediaResult> {
  if (step.kind === "stitch") {
    return stitchVideos({ inputUrls, runId, step });
  }
  if (step.kind === "keyframes") {
    return extractKeyframes({ inputUrls, runId, step });
  }
  throw new ZapRunError({
    code: "LOCAL_STEP_FAILED",
    message: `Unsupported local step kind ${step.kind}.`,
    remediation: "Route this step through a provider adapter or add a local executor for the kind.",
    retryable: false,
  });
}

export async function prepareExtendFirstFrame({
  parentStepId,
  previousVideoUrl,
  runId,
  step,
}: {
  parentStepId?: string;
  previousVideoUrl?: string;
  runId: string;
  step: ZapStep;
}): Promise<LocalMediaResult | null> {
  const config = step.first_frame as { from?: unknown; upscale?: unknown } | undefined;
  if (step.kind !== "video.extend" || config?.from !== "prev.last_frame") return null;
  if (!previousVideoUrl) {
    throw new ZapRunError({
      code: "LOCAL_STEP_FAILED",
      message: `Extend step ${step.id} requested prev.last_frame, but no previous video output is available.`,
      remediation: "Reference an initial video step before this extend step or change first_frame.from to an explicit image ref.",
      retryable: false,
    });
  }

  const parents = parentStepId ? [parentStepId] : [];
  if (shouldUseFixtureManifest([previousVideoUrl])) {
    return persistJsonManifest(
      runId,
      step,
      {
        engine: "fixture",
        from: "prev.last_frame",
        source: previousVideoUrl,
        stepId: step.id,
        upscale: config.upscale ?? null,
      },
      parents,
      "first_frame",
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), `zap-${runId}-${step.id}-first-frame-`));
  try {
    const inputPath = await materializeMediaAsset(previousVideoUrl, dir, 0, "video");
    const rawFramePath = path.join(dir, "last-frame.png");
    await runBinary("ffmpeg", ["-y", "-sseof", "-0.1", "-i", inputPath, "-frames:v", "1", rawFramePath]);

    const wants4k = String(config.upscale ?? "").toLowerCase() === "4k";
    const framePath = wants4k ? path.join(dir, "last-frame-4k.png") : rawFramePath;
    if (wants4k) {
      await runBinary("ffmpeg", [
        "-y",
        "-i",
        rawFramePath,
        "-vf",
        "scale='if(gte(iw,ih),3840,-2)':'if(gte(iw,ih),-2,3840)'",
        framePath,
      ]);
    }

    const stored = await persistLocalFileAsset(framePath, `runs/${runId}/${step.id}/first_frame`, "image/png");
    return {
      kind: "png" as const,
      parents,
      storageKey: stored.storageKey,
      url: stored.url,
    };
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function stitchVideos({
  inputUrls,
  runId,
  step,
}: {
  inputUrls: string[];
  runId: string;
  step: ZapStep;
}) {
  if (inputUrls.length === 0) {
    throw new ZapRunError({
      code: "LOCAL_STEP_FAILED",
      message: `Stitch step ${step.id} has no resolved input videos.`,
      remediation: "Ensure the stitch inputs reference prior video steps, for example inputs: [initial_gen, extend.*].",
      retryable: false,
    });
  }

  if (shouldUseFixtureManifest(inputUrls)) {
    return persistJsonManifest(runId, step, {
      engine: "fixture",
      inputs: inputUrls,
      output: "Zap.mp4",
      stepId: step.id,
    });
  }

  if (step.stitch?.engine === "hyperframes") {
    const rendered = await renderHyperframesStitch({ assetUrls: inputUrls, runId, step });
    if (!rendered.assetUrl) {
      throw new ZapRunError({
        code: "LOCAL_STEP_FAILED",
        message: rendered.error ?? `HyperFrames stitch step ${step.id} did not produce an asset.`,
        remediation: "Install HyperFrames or switch stitch.engine to local for ffmpeg concatenation.",
        retryable: true,
      });
    }
    return {
      kind: rendered.assetUrl.endsWith(".webm") ? "mp4" as const : "mp4" as const,
      parents: step.inputs ?? [],
      storageKey: rendered.storageKey,
      url: rendered.assetUrl,
    };
  }

  const dir = await mkdtemp(path.join(tmpdir(), `zap-${runId}-${step.id}-`));
  try {
    const inputs = await Promise.all(inputUrls.map((url, index) => materializeMediaAsset(url, dir, index, "video")));
    const concatList = inputs.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n");
    const concatPath = path.join(dir, "segments.txt");
    const outputPath = path.join(dir, "Zap.mp4");
    await writeFile(concatPath, concatList);

    try {
      await runBinary("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", outputPath]);
    } catch {
      await runBinary("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    }

    const stored = await persistLocalFileAsset(outputPath, `runs/${runId}/${step.id}/Zap`, "video/mp4");
    return {
      kind: "mp4" as const,
      parents: step.inputs ?? [],
      storageKey: stored.storageKey,
      url: stored.url,
    };
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function extractKeyframes({
  inputUrls,
  runId,
  step,
}: {
  inputUrls: string[];
  runId: string;
  step: ZapStep;
}) {
  const [inputUrl] = inputUrls;
  if (!inputUrl) {
    throw new ZapRunError({
      code: "LOCAL_STEP_FAILED",
      message: `Keyframes step ${step.id} has no resolved input video.`,
      remediation: "Reference a prior video step in inputs before extracting keyframes.",
      retryable: false,
    });
  }

  if (shouldUseFixtureManifest(inputUrls)) {
    return persistJsonManifest(runId, step, {
      engine: "fixture",
      frames: inputUrls,
      stepId: step.id,
    });
  }

  const dir = await mkdtemp(path.join(tmpdir(), `zap-${runId}-${step.id}-`));
  try {
    const inputPath = await materializeMediaAsset(inputUrl, dir, 0, "video");
    const durationS = await probeDuration(inputPath);
    const count = Number(step.keyframes?.count ?? 4);
    const framePattern = path.join(dir, "frame-%03d.png");
    await runBinary("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vf",
      `fps=${Math.max(1, count)}/${Math.max(1, durationS)}`,
      "-frames:v",
      String(Math.max(1, count)),
      framePattern,
    ]);

    const frames = (await readdir(dir))
      .filter((file) => file.startsWith("frame-") && file.endsWith(".png"))
      .sort();
    const frameUrls = [];
    for (const frame of frames) {
      const stored = await persistLocalFileAsset(path.join(dir, frame), `runs/${runId}/${step.id}/${frame.replace(/\.png$/, "")}`, "image/png");
      frameUrls.push(stored.url);
    }

    return persistJsonManifest(runId, step, {
      durationS,
      engine: "ffmpeg",
      frames: frameUrls,
      stepId: step.id,
    });
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function persistJsonManifest(
  runId: string,
  step: ZapStep,
  manifest: Record<string, unknown>,
  parents = step.inputs ?? [],
  name = "manifest",
) {
  const dataUrl = `data:application/json;base64,${Buffer.from(JSON.stringify(manifest, null, 2)).toString("base64")}`;
  const stored = await persistDataUrlAsset(dataUrl, `runs/${runId}/${step.id}/${name}`);
  return {
    kind: "json" as const,
    parents,
    storageKey: stored.storageKey,
    url: stored.url,
  };
}

async function materializeMediaAsset(url: string, dir: string, index: number, expected: "video") {
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) {
      throw localMediaError(`Unsupported data URL format for local media input ${index}.`);
    }
    const [, mime, encoded] = match;
    if (!mime.startsWith(`${expected}/`)) {
      throw localMediaError(`Expected ${expected} input for local media step, received ${mime}.`);
    }
    const target = path.join(dir, `input-${index}.${extensionForMime(mime)}`);
    await writeFile(target, Buffer.from(encoded, "base64"));
    return target;
  }

  if (url.startsWith("/generated/")) {
    const localPath = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", url.replace(/^\/+/, ""));
    await ensureReadable(localPath);
    return localPath;
  }

  if (url.startsWith("file://")) {
    const localPath = fileURLToPath(url);
    await ensureReadable(localPath);
    return localPath;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    const response = await fetch(url);
    if (!response.ok) {
      throw localMediaError(`Failed to fetch local media input ${index}: ${response.status}.`);
    }
    const mime = response.headers.get("content-type")?.split(";").at(0) ?? "video/mp4";
    const target = path.join(dir, `input-${index}.${extensionForMime(mime)}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
    return target;
  }

  const localPath = path.isAbsolute(url) ? url : path.join(/*turbopackIgnore: true*/ process.cwd(), url);
  await ensureReadable(localPath);
  return localPath;
}

async function probeDuration(filePath: string) {
  const { stdout } = await runBinary("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = Number(stdout.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : 1;
}

async function runBinary(command: string, args: string[]) {
  try {
    return await execFileAsync(command, args, { maxBuffer: 20_000_000 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ZapRunError({
      code: "LOCAL_STEP_FAILED",
      message: `${command} failed while executing a local media step.`,
      remediation: `Install ${command}, verify the input media is readable, or switch this step to a provider-backed implementation. Detail: ${detail}`,
      retryable: true,
    });
  }
}

async function ensureReadable(filePath: string) {
  try {
    await access(filePath);
  } catch {
    throw localMediaError(`Local media input is not readable: ${filePath}.`);
  }
}

function localMediaError(message: string) {
  return new ZapRunError({
    code: "LOCAL_STEP_FAILED",
    message,
    remediation: "Provide reachable media URLs or run the preceding provider steps again before retrying the local step.",
    retryable: false,
  });
}

function shouldUseFixtureManifest(inputUrls: string[]) {
  return inputUrls.every((url) => url.startsWith("data:application/json") || url.startsWith("mock://"));
}

function extensionForMime(mime: string) {
  if (mime === "video/mp4") return "mp4";
  if (mime === "image/png") return "png";
  if (mime === "audio/wav") return "wav";
  if (mime === "application/json") return "json";
  return mime.split("/").at(1)?.split("+").at(0) ?? "bin";
}
