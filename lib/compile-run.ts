import { promises as fs } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { getRunSnapshot, type RunSnapshot } from "./run-ledger";
import { loadZapSpec, readPrompt } from "./zap-files";
import { ZapRunError } from "./zap-errors";
import type { ZapSpec, ZapStep } from "./zap-schema";

export type CompileRunOptions = {
  saveDraft?: boolean;
  slug?: string;
};

export type CompileRunResult = {
  estimateUsd: number;
  markdown: string;
  path?: string;
  runId: string;
  slug: string;
};

export async function compileRun(runId: string, options: CompileRunOptions = {}): Promise<CompileRunResult> {
  const snapshot = await getRunSnapshot(runId);
  if (!snapshot.run) {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Run ${runId} was not found.`,
      remediation: "Use get_run_status to verify the run id, then retry compile_run.",
      retryable: false,
    });
  }
  if (snapshot.run.status !== "done") {
    throw new ZapRunError({
      code: "SCHEMA_INVALID",
      message: `Run ${runId} is ${snapshot.run.status}, not done.`,
      remediation: "Only compile completed runs so generated recipes derive from verified traces.",
      retryable: true,
    });
  }

  const sourceZap = await loadZapSpec(snapshot.run.zapSlug);
  if (!sourceZap) {
    throw new ZapRunError({
      code: "UNKNOWN_ZAP",
      message: `Source Zap ${snapshot.run.zapSlug} was not found.`,
      remediation: "Restore the original recipe skill before compiling this run.",
      retryable: false,
    });
  }

  const slug = options.slug ?? `${sourceZap.zap}-compiled-${sanitizeSlug(runId.replace(/^run_/, "").slice(0, 8))}`;
  const estimateUsd = estimateActualCost(snapshot);
  const steps = await compileSteps(sourceZap, snapshot);
  const frontmatter = {
    zap: slug,
    version: 2,
    description: `${sourceZap.description} Compiled from run ${runId}.`,
    compiled_from_run_id: runId,
    lineage: {
      source_zap: sourceZap.zap,
      source_version: sourceZap.version,
    },
    inputs: sourceZap.inputs,
    defaults: sourceZap.defaults,
    budget: {
      estimate_usd: roundCurrency(estimateUsd),
      cap_usd: Math.max(sourceZap.budget.cap_usd, roundCurrency(estimateUsd * 1.25)),
    },
    steps,
    output: sourceZap.output,
  };
  const markdown = `---\n${stringify(frontmatter).trim()}\n---\n\n# ${titleize(slug)}\n\nCompiled from run \`${runId}\` after successful execution. Estimates derive from recorded actuals when providers returned them, otherwise from quotes.\n`;

  let savedPath: string | undefined;
  if (options.saveDraft) {
    const dir = path.join(process.cwd(), "agent", "skills", `zap-${slug}`);
    await fs.mkdir(dir, { recursive: true });
    savedPath = path.join(dir, "Zap.md");
    await fs.writeFile(savedPath, markdown);
    await fs.writeFile(path.join(dir, "SKILL.md"), skillWrapper(frontmatter.description, slug));
  }

  return {
    estimateUsd: roundCurrency(estimateUsd),
    markdown,
    path: savedPath,
    runId,
    slug,
  };
}

async function compileSteps(sourceZap: ZapSpec, snapshot: RunSnapshot) {
  return Promise.all(
    sourceZap.steps.map(async (step) => {
      const traces = tracesForStep(step, snapshot);
      const lastTrace = traces.at(-1);
      const compiled: Record<string, unknown> = {
        id: step.id,
        kind: step.kind,
      };
      if (step.tier) compiled.tier = step.tier;
      if (lastTrace?.model ?? step.model) compiled.model = lastTrace?.model ?? step.model;
      if (lastTrace?.provider ?? step.provider) compiled.provider = lastTrace?.provider ?? step.provider;
      if (step.duration_s) compiled.duration_s = step.duration_s;
      if (step.candidates) compiled.candidates = step.candidates;
      if (step.inputs) compiled.inputs = step.inputs;
      if (step.reference_images) compiled.reference_images = step.reference_images;
      if (step.repeat) compiled.repeat = step.repeat;
      if (step.extend) compiled.extend = step.extend;
      if (step.first_frame) compiled.first_frame = step.first_frame;
      if (step.keyframes) compiled.keyframes = step.keyframes;
      if (step.audio) compiled.audio = step.audio;
      if (step.judge) compiled.judge = step.judge;
      if (step.rlhf) compiled.rlhf = step.rlhf;
      if (step.prompt) compiled.prompt = await inlinePrompt(sourceZap, step);
      return compiled;
    }),
  );
}

function tracesForStep(step: ZapStep, snapshot: RunSnapshot) {
  if (step.kind !== "video.extend") return snapshot.steps.filter((trace) => trace.stepId === step.id);
  return snapshot.steps.filter((trace) => trace.stepId === step.id || trace.stepId.startsWith(`${step.id}_`));
}

async function inlinePrompt(sourceZap: ZapSpec, step: ZapStep) {
  if (!step.prompt) return undefined;
  if (!step.prompt.endsWith(".md") && !step.prompt.startsWith("prompts/")) return step.prompt;
  return readPrompt(sourceZap.zap, step.prompt);
}

function estimateActualCost(snapshot: RunSnapshot) {
  return snapshot.steps.reduce((sum, step) => sum + (step.actualUsd ?? step.priceQuoteUsd ?? 0), 0);
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function titleize(slug: string) {
  return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function sanitizeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "trace";
}

function skillWrapper(description: string, slug: string) {
  return `---\ndescription: ${JSON.stringify(description)}\n---\n\n# Zap ${slug}\n\nCompiled executable Zap frontmatter lives in ./Zap.md. Use this skill when replaying or improving the ${slug} recipe.\n`;
}
