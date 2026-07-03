import { parseDocument } from "yaml";
import { z } from "zod";

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
  provider: z.string().optional(),
  reference_images: z.array(z.string()).optional(),
  repeat: z.object({
    default: z.number().int().min(0).optional(),
    max: z.number().int().min(0).max(64).optional(),
    min: z.number().int().min(0).optional(),
  }).optional(),
  rlhf: z.union([z.literal("optional"), z.boolean()]).optional(),
  shared: z.boolean().optional(),
  tier: z.enum(["draft", "final"]).optional(),
});

export const zapSpecSchema = z.object({
  budget: z.object({
    cap_usd: z.number().positive(),
    estimate_usd: z.number().nonnegative(),
  }),
  defaults: z.object({
    aspect: z.string().optional(),
    provider: z.string().default("gmi"),
  }).default({ provider: "gmi" }),
  description: z.string(),
  inputs: z.record(z.string(), zapInputSchema).default({}),
  output: z.string().default("Zap.mp4"),
  steps: z.array(zapStepSchema).min(1),
  version: z.number().int().positive(),
  zap: z.string().min(1),
});

export type ZapInput = z.infer<typeof zapInputSchema>;
export type ZapStep = z.infer<typeof zapStepSchema>;
export type ZapSpec = z.infer<typeof zapSpecSchema>;
export type PublicZapSpec = ZapSpec & { title: string };

export function parseZapMarkdown(markdown: string): ZapSpec {
  const frontmatter = extractFrontmatter(markdown);
  const parsed = parseDocument(frontmatter).toJS();
  const spec = zapSpecSchema.parse(parsed);
  validateVariables(spec);
  return spec;
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

function validateVariables(spec: ZapSpec) {
  const declared = new Set(Object.keys(spec.inputs));
  for (const step of spec.steps) {
    const promptRef = step.prompt ?? "";
    for (const variable of promptRef.matchAll(/\{([A-Z0-9_]+)\}/g)) {
      if (!declared.has(variable[1])) {
        throw new Error(`Step ${step.id} references undeclared input {${variable[1]}}.`);
      }
    }
  }
}

function titleize(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
