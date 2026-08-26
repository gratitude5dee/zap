// @ts-check
import { printJson } from "../../lib/output.js";
import { estimateUsd, expandSteps, parseZapFile, plannedStep, resolveZapFiles } from "../../lib/recipe.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "inspect",
  summary: "Show provider/model plan details",
  usage: "zap inspect <slug|Zap.md> [--json]",
  async run({ args, flags }) {
    const file = (await resolveZapFiles(args))[0];
    if (!file) throw new Error("Usage: zap inspect <slug|Zap.md> [--json]");
    const spec = await parseZapFile(file);
    const extendCount = Number(flags.extend ?? spec.steps.find((step) => step.kind === "video.extend")?.repeat?.default ?? 0);
    const steps = expandSteps(spec, extendCount);
    const result = {
      budget: spec.budget,
      defaults: spec.defaults,
      file,
      publish: spec.publish,
      quoteUsd: estimateUsd(spec, steps),
      steps: steps.map((step) => plannedStep(spec, step)),
      version: spec.version,
      zap: spec.zap,
    };
    if (flags.json) printJson(result);
    else {
      console.log(`${result.zap} v${result.version} quote $${result.quoteUsd.toFixed(2)}`);
      result.steps.forEach((step) => console.log(`${step.stepId} ${step.provider}/${step.model} ${step.kind} $${step.quoteUsd.toFixed(2)}`));
    }
  },
};
