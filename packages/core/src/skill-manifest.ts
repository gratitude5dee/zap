// Skill contract for the VM skill store (§5.11, Z8).
// A skill is a directory holding a SKILL.md whose YAML frontmatter carries
// `name`, `description`, `version`, and optional `metadata.zap.{weight,lanes,harnesses}`.
// In a runtime the store lives at /zap/skills/<name>/SKILL.md; the `skills.store`
// plugin symlinks/copies entries into each harness's `skillsDirs` at boot.
import { parseDocument } from "yaml";
import { z } from "zod";

export const SKILL_STORE_ROOT = "/zap/skills";

const skillNameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);

export const skillZapMetadataSchema = z
  .object({
    weight: z.enum(["light", "med", "heavy"]).optional(),
    lanes: z.array(z.string().min(1)).optional(),
    harnesses: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const skillFrontmatterSchema = z
  .object({
    name: skillNameSchema,
    description: z.string().min(1).max(500),
    version: z.string().min(1),
    metadata: z
      .object({
        zap: skillZapMetadataSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SkillZapMetadata = z.infer<typeof skillZapMetadataSchema>;
export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

/** Path of a skill's SKILL.md inside the VM skill store. */
export function skillStorePath(name: string): string {
  const parsed = skillNameSchema.safeParse(name);
  if (!parsed.success) throw new Error(`Invalid skill name "${name}".`);
  return `${SKILL_STORE_ROOT}/${parsed.data}/SKILL.md`;
}

/** Parses and validates a SKILL.md against the skill contract. */
export function parseSkillMarkdown(markdown: string): ParsedSkill {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("SKILL.md is missing YAML frontmatter.");
  const document = parseDocument(match[1]);
  if (document.errors.length > 0) {
    throw new Error(`SKILL.md frontmatter is not valid YAML: ${document.errors[0].message}`);
  }
  const frontmatter = skillFrontmatterSchema.parse(document.toJS());
  return { body: match[2], frontmatter };
}

/** Returns validation issues instead of throwing (used by `zap skills check`). */
export function validateSkillMarkdown(markdown: string): { ok: true; skill: ParsedSkill } | { ok: false; error: string } {
  try {
    return { ok: true, skill: parseSkillMarkdown(markdown) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), ok: false };
  }
}
