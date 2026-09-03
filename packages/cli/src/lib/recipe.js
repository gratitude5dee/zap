// @ts-check
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describeStagedListing, orderCommerceSteps } from "@wzrdtech/core/planner";
import { isCommerceStep, parseZapMarkdown, validateZapPromptTemplates } from "@wzrdtech/core/schema";
import { defaultModelFor, getProviderAdapter, listProviderAdapters } from "@wzrdtech/providers";
import { extensionFromUrl, sleep, slugify } from "./project.js";

/** @param {string[]} args */
export async function resolveZapFiles(args) {
  if (args.length > 0) return args.map((entry) => resolveZapFile(entry));
  const skillsDir = path.join(process.cwd(), "agent", "skills");
  if (!existsSync(skillsDir)) return [];
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(skillsDir, entry.name, "Zap.md"))
    .filter((file) => existsSync(file));
}

/** @param {string} entry */
export function resolveZapFile(entry) {
  const direct = path.resolve(process.cwd(), entry);
  const slug = slugify(entry.replace(/\.md$/i, ""));
  const candidates = [
    direct,
    path.join(process.cwd(), "agent", "skills", entry, "Zap.md"),
    path.join(process.cwd(), "agent", "skills", `zap-${slug}`, "Zap.md"),
    path.join(process.cwd(), "agent", "skills", slug, "Zap.md"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? direct;
}

/** @param {string} file */
export async function parseZapFile(file) {
  const content = await fs.readFile(file, "utf8");
  const spec = parseZapMarkdown(content);
  validateZapPromptTemplates(spec, await readPromptContents(file, spec));
  return spec;
}

export function validateSpec(spec) {
  for (const step of spec.steps) {
    if (step.kind === "stitch" && step.stitch?.engine === "hyperframes" && !existsSync(path.join(process.cwd(), "DESIGN.md"))) {
      throw new Error("HyperFrames stitch requires a DESIGN.md visual identity.");
    }
  }
}

export function validateRequiredInputs(spec, inputs) {
  for (const [name, input] of Object.entries(spec.inputs ?? {})) {
    if (input.required && inputs[name] === undefined) {
      throw new Error(`Missing required input ${name}. Use --input ${name}=value.`);
    }
  }
}

export function withPlanInputDefaults(spec, inputs, live) {
  if (live) return inputs;
  const next = { ...inputs };
  for (const [name, input] of Object.entries(spec.inputs ?? {})) {
    if (input.required && next[name] === undefined) {
      next[name] = input.type === "image"
        ? `https://example.com/${name}.png`
        : input.type === "number" ? "1" : `example-${name.toLowerCase()}`;
    }
  }
  return next;
}

export function lintSpec(spec) {
  const warnings = [];
  const providers = supportedProviderIds();
  if (!providers.includes(spec.defaults?.provider)) {
    warnings.push(`defaults.provider must be one of ${providers.join(", ")}.`);
  }
  if (Number(spec.budget?.cap_usd ?? 0) <= 0) warnings.push("budget.cap_usd should be positive.");
  if (!spec.steps.some((step) => step.kind === "stitch" || isCommerceStep(step))) {
    warnings.push("Zap should end with a stitch step or a commerce staging step.");
  }
  const commerceSteps = spec.steps.filter((step) => isCommerceStep(step));
  if (commerceSteps.length > 0 && Number(spec.budget?.cap_usd ?? 0) > 25) {
    warnings.push("Commerce Zaps should keep budget.cap_usd small (<= $25); staging itself costs $0.");
  }
  return warnings;
}

export function expandSteps(spec, extendCount) {
  return orderCommerceSteps(spec.steps.flatMap((step) => {
    if (step.kind !== "video.extend") return [step];
    const max = step.repeat?.max ?? 64;
    const count = Math.max(step.repeat?.min ?? 0, Math.min(extendCount, max));
    return Array.from({ length: count }, (_, index) => ({ ...step, id: `${step.id}_${index + 1}` }));
  }));
}

export function quoteStep(spec, step) {
  if (isLocalStep(step)) return 0;
  const provider = step.provider ?? spec.defaults?.provider ?? "fal";
  const model = step.model ?? spec.defaults?.models?.[step.kind] ?? defaultModelFor(provider, step.kind);
  const rates = getProviderAdapter(provider);
  try {
    return rates.price({
      capability: step.kind,
      durationS: step.duration_s,
      inputs: {},
      model,
      prompt: "",
      provider,
      runId: "quote",
      stepId: step.id,
    });
  } catch {
    return 0;
  }
}

export function estimateUsd(spec, steps) {
  return steps.reduce((sum, step) => sum + quoteStep(spec, step), 0);
}

export async function readPromptContents(file, spec) {
  const entries = {};
  await Promise.all((spec.steps ?? []).map(async (step) => {
    if (!step.prompt || !(step.prompt.endsWith(".md") || step.prompt.startsWith("prompts/"))) return;
    entries[step.prompt] = await readPromptFile(file, step.prompt);
  }));
  return entries;
}

/**
 * @param {string} zapFile
 * @param {string | undefined} promptPath
 */
export async function readPromptFile(zapFile, promptPath) {
  if (!promptPath) return "";
  if (!(promptPath.endsWith(".md") || promptPath.startsWith("prompts/"))) return promptPath;
  return fs.readFile(path.join(path.dirname(zapFile), promptPath), "utf8");
}

/**
 * @param {string} template
 * @param {Record<string, string>} inputs
 */
export function interpolate(template, inputs) {
  return template.replace(/\{([A-Z0-9_]+)\}/g, (_, name) => String(inputs[name] ?? ""));
}

export function isLocalStep(step) {
  return step.kind === "stitch" || step.kind === "keyframes" || isCommerceStep(step);
}

export function supportedProviderIds() {
  return listProviderAdapters().map((adapter) => adapter.id).sort();
}

export function plannedStep(spec, step, inputs = {}) {
  const provider = isCommerceStep(step) ? "air" : isLocalStep(step) ? "local" : step.provider ?? spec.defaults?.provider ?? "fal";
  const model = isLocalStep(step) ? step.model ?? "local" : step.model ?? spec.defaults?.models?.[step.kind] ?? defaultModelFor(provider, step.kind);
  const planned = {
    kind: step.kind,
    model,
    provider,
    quoteUsd: isLocalStep(step) ? 0 : quoteStep(spec, step),
    status: "planned",
    stepId: step.id,
  };
  if (step.kind === "commerce.stage_listing") {
    return { ...planned, wouldStage: describeStagedListing(step, inputs) };
  }
  if (step.kind === "commerce.payment_request") {
    return {
      ...planned,
      wouldStage: { action: "payment_request", charges: false, requiresOwnerApproval: true, ...step.payment_request },
    };
  }
  return planned;
}

export async function pollProviderUntilDone(adapter, requestId, secrets) {
  const timeoutMs = Number(process.env.ZAP_CLI_POLL_TIMEOUT_MS ?? 20 * 60 * 1000);
  const intervalMs = Number(process.env.ZAP_CLI_POLL_INTERVAL_MS ?? 5000);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await adapter.poll(requestId, secrets);
    if (result.status === "done") return result;
    if (result.status === "failed") throw new Error(result.error ?? `${adapter.id} request ${requestId} failed.`);
    await sleep(intervalMs);
  }
  throw new Error(`${adapter.id} request ${requestId} did not finish before timeout.`);
}

export async function persistCliAsset(url, dir, stepId) {
  await fs.mkdir(dir, { recursive: true });
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("data:")) return url;
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) return url;
    const extension = match[1].split("/").at(1)?.split("+").at(0) ?? "bin";
    const target = path.join(dir, `${stepId}.${extension}`);
    await fs.writeFile(target, Buffer.from(match[2], "base64"));
    return target;
  }
  const response = await fetch(url);
  if (!response.ok) return url;
  const extension = extensionFromUrl(url);
  const target = path.join(dir, `${stepId}.${extension}`);
  await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

export function resolveStepInputUrls(step, inputs, assetUrls) {
  const refs = [...(step.inputs ?? []), ...(step.reference_images ?? [])];
  const urls = [];
  for (const ref of refs) {
    if (ref.endsWith(".*")) {
      const prefix = ref.slice(0, -2);
      urls.push(...Array.from(assetUrls.entries()).filter(([stepId]) => stepId === prefix || stepId.startsWith(`${prefix}_`)).map(([, url]) => url));
      continue;
    }
    if (ref.startsWith("user.")) {
      const value = inputs[ref.slice("user.".length)];
      if (typeof value === "string") urls.push(value);
      continue;
    }
    const asset = assetUrls.get(ref);
    if (asset) urls.push(asset);
    else if (typeof inputs[ref] === "string") urls.push(inputs[ref]);
  }
  if (urls.length === 0 && typeof inputs.image === "string") urls.push(inputs.image);
  return Array.from(new Set(urls.filter(Boolean)));
}

export async function bundleZapSource(file, spec) {
  const zapMd = await fs.readFile(file, "utf8");
  const prompts = {};
  await Promise.all((spec.steps ?? []).map(async (step) => {
    if (!step.prompt || !(step.prompt.endsWith(".md") || step.prompt.startsWith("prompts/"))) return;
    prompts[step.prompt] = await readPromptFile(file, step.prompt);
  }));
  return {
    estimateUsd: spec.budget.estimate_usd,
    prompts,
    slug: spec.publish?.slug ?? spec.zap,
    source: { prompts, zapMd },
    tags: [],
    version: spec.version,
    zapMd,
  };
}
