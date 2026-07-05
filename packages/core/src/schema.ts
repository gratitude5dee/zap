import { parseDocument } from "yaml";
import { z } from "zod";

export class ZapSchemaError extends Error {
  readonly code = "SCHEMA_INVALID";
  readonly retryable = false;
}

export const zapInputSchema = z.object({
  hint: z.string().optional(),
  label: z.string().optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
  type: z.enum(["string", "textarea", "image", "video", "select", "number"]),
});

export const zapStepKindSchema = z.enum([
  "image.gen",
  "image.edit",
  "video.gen",
  "video.extend",
  "video.edit",
  "video.upscale",
  "audio.tts",
  "audio.music",
  "audio.sfx",
  "keyframes",
  "stitch",
]);

export const zapProviderSchema = z.enum(["gmi", "fal", "prodia", "runware"]);
export type ZapProvider = z.infer<typeof zapProviderSchema>;

export const zapStitchSchema = z.object({
  engine: z.enum(["auto", "local", "hyperframes"]).default("auto"),
  fps: z.number().int().min(1).max(120).optional(),
  format: z.enum(["mp4", "webm"]).default("mp4"),
  quality: z.enum(["draft", "standard", "high"]).default("standard"),
}).default({ engine: "auto", format: "mp4", quality: "standard" });

export const zapStepSchema = z.object({
  audio: z.record(z.string(), z.unknown()).optional(),
  candidates: z.number().int().min(1).max(16).optional(),
  duration_s: z.number().positive().optional(),
  extend: z.object({ mode: z.enum(["chain", "anchored"]).default("chain") }).optional(),
  first_frame: z.record(z.string(), z.unknown()).optional(),
  id: z.string().min(1),
  inputs: z.array(z.string()).optional(),
  judge: z.record(z.string(), z.unknown()).optional(),
  keyframes: z.record(z.string(), z.unknown()).optional(),
  kind: zapStepKindSchema,
  model: z.string().optional(),
  prompt: z.string().optional(),
  provider: zapProviderSchema.optional(),
  reference_images: z.array(z.string()).optional(),
  repeat: z.object({
    default: z.number().int().min(0).optional(),
    max: z.number().int().min(0).max(64).optional(),
    min: z.number().int().min(0).optional(),
  }).optional(),
  retry: z.object({
    backoff_s: z.number().min(0).max(300).default(0),
    fallback_model: z.string().optional(),
    fallback_provider: zapProviderSchema.optional(),
    max: z.number().int().min(0).max(8).default(0),
  }).optional(),
  rlhf: z.union([z.literal("optional"), z.boolean()]).optional(),
  shared: z.boolean().optional(),
  stitch: zapStitchSchema.optional(),
  tier: z.enum(["draft", "final"]).optional(),
});

export const zapPublishSchema = z.object({
  embed: z.object({
    allowOrigins: z.array(z.string()).default(["*"]),
    enabled: z.boolean().default(true),
    height: z.number().int().min(240).max(2160).default(720),
    theme: z.enum(["auto", "dark", "light"]).default("auto"),
    width: z.number().int().min(240).max(3840).default(1280),
  }).optional(),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/).optional(),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
}).partial().optional();

export const zapSpecSchema = z.object({
  budget: z.object({
    cap_usd: z.number().positive(),
    estimate_usd: z.number().nonnegative(),
  }),
  defaults: z.object({
    aspect: z.string().optional(),
    models: z.record(z.string(), z.string()).default(() => ({})),
    provider: zapProviderSchema.default("gmi"),
  }).default(() => ({ models: {}, provider: "gmi" as const })),
  description: z.string(),
  inputs: z.record(z.string(), zapInputSchema).default({}),
  output: z.string().default("Zap.mp4"),
  publish: zapPublishSchema,
  steps: z.array(zapStepSchema).min(1),
  version: z.literal(2),
  zap: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/),
});

export type ZapInput = z.infer<typeof zapInputSchema>;
export type ZapStep = z.infer<typeof zapStepSchema>;
export type ZapStepKind = z.infer<typeof zapStepKindSchema>;
export type ZapSpec = z.infer<typeof zapSpecSchema>;
export type PublicZapSpec = ZapSpec & { title: string };

export function parseZapMarkdown(markdown: string): ZapSpec {
  const frontmatter = extractFrontmatter(markdown);
  const parsed = parseDocument(frontmatter).toJS();
  const spec = zapSpecSchema.parse(parsed);
  validateSpec(spec);
  return spec;
}

export function validateZapPromptTemplates(spec: ZapSpec, promptContents: Record<string, string>) {
  for (const step of spec.steps) {
    const promptRef = step.prompt;
    if (!promptRef || !isPromptFile(promptRef)) continue;
    const content = promptContents[promptRef];
    if (content === undefined) {
      throw new ZapSchemaError(`Step ${step.id} references missing prompt file ${promptRef}.`);
    }
    validateTemplateVariables(spec, step.id, content);
  }
}

export function publicZapSpec(spec: ZapSpec): PublicZapSpec {
  return { ...spec, title: titleize(spec.zap) };
}

function extractFrontmatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    throw new Error("Zap recipe is missing YAML frontmatter.");
  }
  return match[1];
}

function validateSpec(spec: ZapSpec) {
  validateDuplicateStepIds(spec);
  validateStepRefs(spec);
  validateVideoDurations(spec);
  validateInlineVariables(spec);
}

function validateInlineVariables(spec: ZapSpec) {
  for (const step of spec.steps) {
    const promptRef = step.prompt ?? "";
    if (!isPromptFile(promptRef)) validateTemplateVariables(spec, step.id, promptRef);
  }
}

function validateDuplicateStepIds(spec: ZapSpec) {
  const seen = new Set<string>();
  for (const step of spec.steps) {
    if (seen.has(step.id)) throw new Error(`Duplicate step id ${step.id}.`);
    seen.add(step.id);
  }
}

function validateStepRefs(spec: ZapSpec) {
  const declaredInputs = new Set(Object.keys(spec.inputs));
  const priorSteps = new Set<string>();
  for (const step of spec.steps) {
    for (const ref of [...(step.inputs ?? []), ...(step.reference_images ?? [])]) {
      validateRef({ declaredInputs, priorSteps, ref, stepId: step.id });
    }
    priorSteps.add(step.id);
  }
}

function validateRef({
  declaredInputs,
  priorSteps,
  ref,
  stepId,
}: {
  declaredInputs: Set<string>;
  priorSteps: Set<string>;
  ref: string;
  stepId: string;
}) {
  if (ref.startsWith("user.")) {
    const inputName = ref.slice("user.".length);
    if (declaredInputs.has(inputName)) return;
    throw new ZapSchemaError(`Step ${stepId} references undeclared input ${ref}.`);
  }

  if (ref.endsWith(".*")) {
    const prefix = ref.slice(0, -2);
    if (priorSteps.has(prefix)) return;
    throw new ZapSchemaError(`Step ${stepId} references unknown repeated step ${ref}.`);
  }

  if (priorSteps.has(ref) || declaredInputs.has(ref)) return;
  throw new ZapSchemaError(`Step ${stepId} references unknown input or step ${ref}.`);
}

function validateVideoDurations(spec: ZapSpec) {
  for (const step of spec.steps) {
    if (step.kind.startsWith("video.") && step.duration_s === undefined) {
      throw new ZapSchemaError(`Video step ${step.id} is missing duration_s.`);
    }
  }
}

function validateTemplateVariables(spec: ZapSpec, stepId: string, template: string) {
  const declared = new Set(Object.keys(spec.inputs));
  for (const variable of template.matchAll(/\{([A-Z0-9_]+)\}/g)) {
    if (!declared.has(variable[1])) {
      throw new ZapSchemaError(`Step ${stepId} references undeclared input {${variable[1]}}.`);
    }
  }
}

function isPromptFile(prompt: string) {
  return prompt.endsWith(".md") || prompt.startsWith("prompts/");
}

function titleize(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
