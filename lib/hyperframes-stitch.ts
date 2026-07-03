import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistLocalFileAsset } from "./blob-store";
import type { ZapStep } from "./zap-schema";

type CommandOptions = {
  cwd?: string;
  timeoutMs?: number;
};

export type HyperframesCommandResult = {
  error?: unknown;
  status: number | null;
  stderr?: string;
  stdout?: string;
};

export type HyperframesCommandRunner = (
  args: string[],
  options?: CommandOptions,
) => HyperframesCommandResult | Promise<HyperframesCommandResult>;

export type HyperframesStitchResult = {
  assetUrl?: string;
  engine: "hyperframes" | "local";
  error?: string;
  projectDir?: string;
  storageKey?: string;
};

type PersistLocalAsset = (filePath: string, key: string, contentType: string) => Promise<{ storageKey: string; url: string }>;

export type RenderHyperframesStitchInput = {
  assetUrls: string[];
  commandRunner?: HyperframesCommandRunner;
  persistLocalAsset?: PersistLocalAsset;
  runId: string;
  step: ZapStep;
};

const COMPOSITION_ID = "zap-stitch";
const DEFAULT_CLIP_DURATION_S = 15;

export async function renderHyperframesStitch({
  assetUrls,
  commandRunner = defaultHyperframesRunner,
  persistLocalAsset = persistLocalFileAsset,
  runId,
  step,
}: RenderHyperframesStitchInput): Promise<HyperframesStitchResult> {
  const fallbackUrl = assetUrls.at(0);
  if (assetUrls.length === 0) {
    return { engine: "local", error: "HyperFrames stitch skipped because no input assets were available." };
  }

  const available = await runHyperframesCommand(commandRunner, ["hyperframes", "--version"], { timeoutMs: 8000 });
  if (!commandSucceeded(available)) {
    return {
      assetUrl: fallbackUrl,
      engine: "local",
      error: `HyperFrames CLI is unavailable; used local stitch fallback. ${commandMessage(available)}`.trim(),
    };
  }

  const projectDir = await mkdtemp(join(tmpdir(), `zap-hyperframes-${safePathSegment(runId)}-${safePathSegment(step.id)}-`));
  await writeFile(join(projectDir, "DESIGN.md"), buildDesignMarkdown(step), "utf8");
  await writeFile(join(projectDir, "index.html"), buildHyperframesCompositionHtml({
    assetUrls,
    clipDurationS: step.duration_s ?? DEFAULT_CLIP_DURATION_S,
    compositionId: COMPOSITION_ID,
  }), "utf8");

  for (const checkArgs of [
    ["hyperframes", "lint", "--json"],
    ["hyperframes", "validate", "--json"],
    ["hyperframes", "inspect", "--json", "--samples", "5"],
  ]) {
    const checked = await runHyperframesCommand(commandRunner, checkArgs, { cwd: projectDir, timeoutMs: 120000 });
    if (!commandSucceeded(checked)) {
      return {
        assetUrl: fallbackUrl,
        engine: "local",
        error: `HyperFrames ${checkArgs[1]} failed; used local stitch fallback. ${commandMessage(checked)}`.trim(),
        projectDir,
      };
    }
  }

  const format = step.stitch?.format ?? "mp4";
  const outputFile = join(projectDir, `Zap.${format}`);
  const renderArgs = [
    "hyperframes",
    "render",
    "--output",
    outputFile,
    "--quality",
    step.stitch?.quality ?? "standard",
    "--format",
    format,
  ];
  if (step.stitch?.fps) renderArgs.push("--fps", String(step.stitch.fps));

  const rendered = await runHyperframesCommand(commandRunner, renderArgs, { cwd: projectDir, timeoutMs: 1000 * 60 * 20 });
  if (!commandSucceeded(rendered) || !existsSync(outputFile)) {
    return {
      assetUrl: fallbackUrl,
      engine: "local",
      error: `HyperFrames render failed; used local stitch fallback. ${commandMessage(rendered)}`.trim(),
      projectDir,
    };
  }

  const stored = await persistLocalAsset(
    outputFile,
    `runs/${runId}/${step.id}/Zap.${format}`,
    format === "webm" ? "video/webm" : "video/mp4",
  );

  return {
    assetUrl: stored.url,
    engine: "hyperframes",
    projectDir,
    storageKey: stored.storageKey,
  };
}

export function buildHyperframesCompositionHtml({
  assetUrls,
  clipDurationS = DEFAULT_CLIP_DURATION_S,
  compositionId = COMPOSITION_ID,
  height = 1080,
  width = 1920,
}: {
  assetUrls: string[];
  clipDurationS?: number;
  compositionId?: string;
  height?: number;
  width?: number;
}) {
  const safeClipDuration = Math.max(1, Number(clipDurationS.toFixed(3)));
  const totalDuration = Math.max(safeClipDuration, Number((safeClipDuration * assetUrls.length).toFixed(3)));
  const clips = assetUrls.map((url, index) => {
    const start = Number((index * safeClipDuration).toFixed(3));
    const id = `clip-${index + 1}`;
    const attrs = [
      `id="${id}"`,
      `class="zap-clip"`,
      `data-start="${start}"`,
      `data-duration="${safeClipDuration}"`,
      `data-track-index="0"`,
      `src="${escapeAttribute(url)}"`,
      `crossorigin="anonymous"`,
    ].join(" ");

    if (isVideoAsset(url)) {
      return [
        `<video ${attrs} muted playsinline></video>`,
        `<audio id="${id}-audio" data-start="${start}" data-duration="${safeClipDuration}" data-track-index="1" src="${escapeAttribute(url)}" crossorigin="anonymous" data-volume="1"></audio>`,
      ].join("\n    ");
    }

    return `<img ${attrs} alt="" />`;
  }).join("\n    ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Zap HyperFrames Stitch</title>
  </head>
  <body>
    <div data-composition-id="${escapeAttribute(compositionId)}" data-start="0" data-duration="${totalDuration}" data-width="${width}" data-height="${height}">
    ${clips}
      <style>
        html,
        body {
          width: 100%;
          height: 100%;
          margin: 0;
          background: #05070a;
          font-family: Inter, Arial, sans-serif;
        }

        [data-composition-id="${escapeAttribute(compositionId)}"] {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: #05070a;
        }

        .zap-clip {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #05070a;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
      <script>
        window.__timelines = window.__timelines || {};
        const zapStitchTimeline = gsap.timeline({ paused: true });
        window.__timelines["${escapeScriptString(compositionId)}"] = zapStitchTimeline;
      </script>
    </div>
  </body>
</html>
`;
}

export function buildDesignMarkdown(step: ZapStep) {
  return `# Zap HyperFrames Stitch Design

## Style Prompt
Render Zap assets as a cinematic creator-first sequence: deep neutral canvas, crisp edge-to-edge media, restrained motion, and no decorative elements that compete with provider output.

## Colors
- Canvas: #05070a
- Ink: #f8fafc
- Soft ink: #cbd5e1
- Accent: #4ade80
- Alert accent: #f97316

## Typography
- Inter for interface-safe labels when labels are added by future recipes.
- Arial fallback for environments without embedded Inter.

## Motion
- Media timing is controlled by HyperFrames clip attributes.
- Do not add random or time-based animation to this generated stitch wrapper.

## What NOT to Do
- Do not crop creator faces with decorative masks.
- Do not introduce generic blue or purple gradients.
- Do not add text overlays unless the Zap recipe explicitly requests them.
- Do not add infinite loops, random effects, or asynchronous timeline construction.

## Runtime Notes
- Generated for step ${step.id}.
`;
}

async function runHyperframesCommand(
  commandRunner: HyperframesCommandRunner,
  args: string[],
  options: CommandOptions,
) {
  try {
    return await commandRunner(args, options);
  } catch (error) {
    return { error, status: 1 };
  }
}

function defaultHyperframesRunner(args: string[], options: CommandOptions = {}): HyperframesCommandResult {
  const result = spawnSync("npx", args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeoutMs,
  });
  return {
    error: result.error,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

function commandSucceeded(result: HyperframesCommandResult) {
  return result.status === 0 && !result.error;
}

function commandMessage(result: HyperframesCommandResult) {
  if (result.error instanceof Error) return result.error.message;
  if (typeof result.error === "string") return result.error;
  return [result.stderr, result.stdout].filter(Boolean).join(" ").trim();
}

function escapeAttribute(value: string) {
  return value.replace(/[&"<>\r\n]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "\"":
        return "&quot;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return " ";
    }
  });
}

function escapeScriptString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function isVideoAsset(url: string) {
  return url.startsWith("data:video/") || /\.(mp4|mov|m4v|webm)(?:[?#].*)?$/i.test(url);
}

function safePathSegment(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 64) || "zap";
}
