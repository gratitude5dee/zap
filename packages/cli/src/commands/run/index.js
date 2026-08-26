// @ts-check
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { defaultModelFor, getProviderAdapter } from "@wzrdtech/providers";
import { printJson } from "../../lib/output.js";
import { requirePayer } from "../../lib/payer.js";
import {
  estimateUsd,
  expandSteps,
  interpolate,
  isLocalStep,
  parseZapFile,
  persistCliAsset,
  plannedStep,
  pollProviderUntilDone,
  readPromptFile,
  resolveStepInputUrls,
  resolveZapFiles,
  validateRequiredInputs,
  validateSpec,
  withPlanInputDefaults,
} from "../../lib/recipe.js";
import { parseInputFlags } from "../../lib/args.js";
import { readCredentialStore, secretsForProvider } from "../../lib/store.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "run",
  summary: "Plan a Zap by default; use --live to submit providers",
  usage: "zap run <slug|Zap.md> [--input KEY=VALUE] [--budget-cap-usd N] [--live] [--json]",
  async run({ args, flags }) {
    const file = (await resolveZapFiles(args))[0];
    if (!file) throw new Error("Usage: zap run <slug|Zap.md> [--input KEY=VALUE] [--live] [--json]");
    if (flags.live) await requirePayer("zap run --live");
    const spec = await parseZapFile(file);
    const budgetCapUsd = flags.budgetCapUsd === undefined ? undefined : Number(flags.budgetCapUsd);
    if (budgetCapUsd !== undefined) {
      if (!Number.isFinite(budgetCapUsd) || budgetCapUsd < 0) throw new Error("--budget-cap-usd must be a non-negative number.");
      spec.budget.cap_usd = budgetCapUsd;
    }
    validateSpec(spec);
    const inputs = withPlanInputDefaults(spec, parseInputFlags(flags.input), Boolean(flags.live));
    if (flags.live) validateRequiredInputs(spec, inputs);
    const extendCount = Number(flags.extend ?? spec.steps.find((step) => step.kind === "video.extend")?.repeat?.default ?? 0);
    const steps = expandSteps(spec, extendCount);
    const quoteUsd = estimateUsd(spec, steps);
    if (quoteUsd > spec.budget.cap_usd) {
      throw new Error(`Run quote $${quoteUsd.toFixed(2)} exceeds recipe cap $${spec.budget.cap_usd}.`);
    }
    const runId = `run_${Date.now().toString(36)}_${createHash("sha1").update(file).digest("hex").slice(0, 6)}`;
    const result = flags.live
      ? await runLiveZap({ file, inputs, runId, spec, steps })
      : {
        live: false,
        message: "Zap plan completed. No provider work submitted.",
        mode: "plan",
        quoteUsd,
        runId,
        status: "planned",
        steps: steps.map((step) => plannedStep(spec, step)),
        zap: spec.zap,
      };
    await fs.mkdir(path.join(process.cwd(), ".zap", "runs", runId), { recursive: true });
    await fs.writeFile(path.join(process.cwd(), ".zap", "runs", runId, "result.json"), JSON.stringify(result, null, 2) + "\n");
    if (flags.json) printJson(result);
    else console.log(`${result.message} ${runId}`);
  },
};

async function runLiveZap({ file, inputs, runId, spec, steps }) {
  const credentials = await readCredentialStore();
  const assetUrls = new Map();
  const runDir = path.join(process.cwd(), ".zap", "runs", runId);
  const results = [];

  for (const step of steps) {
    if (isLocalStep(step)) {
      const inputUrls = resolveStepInputUrls(step, inputs, assetUrls);
      const zapUrl = inputUrls.at(-1);
      results.push({ ...plannedStep(spec, step), assetUrl: zapUrl, status: "done" });
      if (zapUrl) assetUrls.set(step.id, zapUrl);
      continue;
    }

    const provider = step.provider ?? spec.defaults?.provider ?? "fal";
    const adapter = getProviderAdapter(provider);
    const model = step.model ?? spec.defaults?.models?.[step.kind] ?? defaultModelFor(provider, step.kind);
    const secrets = secretsForProvider(credentials, provider);
    const prompt = interpolate(await readPromptFile(file, step.prompt), inputs);
    const imageUrls = resolveStepInputUrls(step, inputs, assetUrls);
    const request = {
      capability: step.kind,
      durationS: step.duration_s,
      inputs: {
        ...inputs,
        imageUrl: imageUrls.at(0),
        imageUrls,
        referenceImages: imageUrls,
      },
      model,
      prompt,
      provider,
      runId,
      secrets,
      stepId: step.id,
    };
    const submitted = await adapter.submit(request, `zap:cli:${runId}:${step.id}`);
    const polled = await pollProviderUntilDone(adapter, submitted.requestId, secrets);
    if (!polled.outputUrl) throw new Error(`${provider} completed ${step.id} without an output URL.`);
    const assetUrl = await persistCliAsset(polled.outputUrl, path.join(runDir, "assets"), step.id);
    assetUrls.set(step.id, assetUrl);
    results.push({
      ...plannedStep(spec, step),
      actualUsd: polled.actualUsd,
      assetUrl,
      providerRequestId: submitted.requestId,
      status: "done",
    });
  }

  return {
    live: true,
    message: "Live Zap run completed.",
    mode: "live",
    quoteUsd: estimateUsd(spec, steps),
    runId,
    status: "done",
    steps: results,
    zap: spec.zap,
    zapUrl: assetUrls.get(steps.at(-1)?.id) ?? Array.from(assetUrls.values()).at(-1),
  };
}
