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
  "commerce.stage_listing",
  "commerce.payment_request",
]);

/**
 * Commerce step kinds are staging-only: they never charge a card or move
 * money. They write a draft (catalog entry / payment request) that the
 * storefront owner approves through a decision before anything goes live.
 */
export const COMMERCE_STEP_KINDS = ["commerce.stage_listing", "commerce.payment_request"] as const;

export const zapListingKindSchema = z.enum(["physical", "digital", "service", "event_ticket"]);
export type ZapListingKind = z.infer<typeof zapListingKindSchema>;

/**
 * Mirrors the field constraints of the storefront catalog sanitizer
 * (air: sanitizeCatalogItem): 1c..$100k prices, integer inventory or null
 * for unlimited, 200-char names, 2000-char descriptions. Template
 * variables ({NAME}) may appear in string fields and resolve at run time;
 * the price may also be a `user.<input>` reference resolved against a
 * number/string input.
 */
export const zapListingSchema = z.object({
  description: z.string().max(2000).optional(),
  image: z.string().min(1).optional(),
  inventory: z.union([z.number().int().min(0), z.null(), z.string().regex(/^user\.[A-Za-z0-9_]+$/)]).optional(),
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).optional(),
  kind: zapListingKindSchema,
  name: z.string().min(1).max(200),
  priceCents: z.union([z.number().int().min(1).max(100_000_00), z.string().regex(/^user\.[A-Za-z0-9_]+$/)]),
});

export const zapPaymentRequestSchema = z.object({
  amount: z.union([z.number().positive(), z.string().regex(/^user\.[A-Za-z0-9_]+$/)]),
  currency: z.enum(["usd", "usdc"]).default("usd"),
  memo: z.string().max(500).optional(),
  payee: z.string().min(1),
});

export const zapProviderSchema = z.enum(["gmi", "fal", "prodia", "runware", "vertex", "aws"]);
export type ZapProvider = z.infer<typeof zapProviderSchema>;

export const zapStitchSchema = z.object({
  engine: z.enum(["auto", "local", "hyperframes"]).default("auto"),
  fps: z.number().int().min(1).max(120).optional(),
  format: z.enum(["mp4", "webm"]).default("mp4"),
  inputs: z.record(z.string(), z.unknown()).optional(),
  quality: z.enum(["draft", "standard", "high"]).default("standard"),
  template: z.string().optional(),
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
  listing: zapListingSchema.optional(),
  model: z.string().optional(),
  payment_request: zapPaymentRequestSchema.optional(),
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
  x_monetization: z.object({
    cdr: z.boolean().optional(),
  }).optional(),
  zap: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/),
});

export type ZapInput = z.infer<typeof zapInputSchema>;
export type ZapStep = z.infer<typeof zapStepSchema>;
export type ZapStepKind = z.infer<typeof zapStepKindSchema>;
export type ZapListing = z.infer<typeof zapListingSchema>;
export type ZapPaymentRequest = z.infer<typeof zapPaymentRequestSchema>;

export function isCommerceStep(step: Pick<ZapStep, "kind">) {
  return (COMMERCE_STEP_KINDS as readonly string[]).includes(step.kind);
}
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
  validateCommerceSteps(spec);
}

function validateCommerceSteps(spec: ZapSpec) {
  const declaredInputs = new Set(Object.keys(spec.inputs));
  const mediaSteps = new Set<string>();
  for (const step of spec.steps) {
    if (step.kind === "commerce.stage_listing") {
      if (!step.listing) throw new ZapSchemaError(`Commerce step ${step.id} is missing its listing.`);
      const imageRef = step.listing.image;
      if (imageRef !== undefined) {
        if (imageRef.startsWith("user.")) {
          validateRef({ declaredInputs, priorSteps: mediaSteps, ref: imageRef, stepId: step.id });
          const inputType = spec.inputs[imageRef.slice("user.".length)]?.type;
          if (inputType !== "image") {
            throw new ZapSchemaError(
              `Commerce step ${step.id} listing.image references ${imageRef}, which is a ${inputType} input; it must be declared with type: image.`,
            );
          }
        } else if (!mediaSteps.has(imageRef)) {
          throw new ZapSchemaError(
            `Commerce step ${step.id} listing.image must reference an earlier image step or user input, got ${imageRef}.`,
          );
        }
      }
      for (const ref of [step.listing.priceCents, step.listing.inventory]) {
        if (typeof ref === "string") validateRef({ declaredInputs, priorSteps: new Set(), ref, stepId: step.id });
      }
      for (const text of [step.listing.name, step.listing.description ?? ""]) {
        validateTemplateVariables(spec, step.id, text);
      }
    } else if (step.kind === "commerce.payment_request") {
      if (!step.payment_request) throw new ZapSchemaError(`Commerce step ${step.id} is missing its payment_request.`);
      if (typeof step.payment_request.amount === "string") {
        validateRef({ declaredInputs, priorSteps: new Set(), ref: step.payment_request.amount, stepId: step.id });
      }
      validateTemplateVariables(spec, step.id, step.payment_request.memo ?? "");
    } else if (step.kind.startsWith("image.")) {
      mediaSteps.add(step.id);
    }
  }
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
