import { parseDocument, stringify } from "yaml";
import { z } from "zod";

export const SPRITE_WIZARD_STEPS = [
  "sandbox",
  "model",
  "connections",
  "connectors",
  "social",
  "channels",
] as const;

export const spriteSandboxPresets = {
  "box-standard": { backend: "box", cpu: 2, memoryMb: 4096, timeoutSeconds: 900 },
  "daytona-standard": { backend: "daytona", cpu: 2, memoryMb: 4096, timeoutSeconds: 900 },
  "docker-local": { backend: "docker", cpu: 2, memoryMb: 4096, timeoutSeconds: 900 },
  "e2b-standard": { backend: "e2b", cpu: 2, memoryMb: 4096, timeoutSeconds: 900 },
  "vercel-standard": { backend: "vercel", cpu: 2, memoryMb: 4096, timeoutSeconds: 900 },
} as const;

export type SpriteSandboxPreset = keyof typeof spriteSandboxPresets;

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/);
const integrationSlugSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{1,127}$/);

export const spriteConnectionSchema = z.object({
  id: integrationSlugSchema,
  kind: z.enum(["mcp", "plugin"]),
  url: z.string().url().optional(),
}).strict().superRefine((connection, ctx) => {
  if (connection.kind === "mcp" && !connection.url) {
    ctx.addIssue({ code: "custom", message: "MCP connections require a URL.", path: ["url"] });
  }
  if (connection.kind === "plugin" && connection.url) {
    ctx.addIssue({ code: "custom", message: "Plugin connections are identified by id and must not set url.", path: ["url"] });
  }
});

export const spriteSpecSchema = z.object({
  channels: z.array(z.enum(["slack", "telegram", "imessage"])).max(3),
  connections: z.array(spriteConnectionSchema).max(32),
  connectors: z.array(integrationSlugSchema).max(32),
  description: z.string().min(1).max(500),
  model: z.object({
    id: z.string().min(1).max(200),
    route: z.enum(["gateway", "openai", "anthropic", "openrouter"]),
  }).strict(),
  sandbox: z.enum(Object.keys(spriteSandboxPresets) as [SpriteSandboxPreset, ...SpriteSandboxPreset[]]),
  social: z.array(integrationSlugSchema).max(16),
  sprite: slugSchema,
  version: z.literal(1),
  zaps: z.array(slugSchema).min(1).max(32),
}).strict();

export type SpriteSpec = z.infer<typeof spriteSpecSchema>;

export function parseSpriteMarkdown(markdown: string): SpriteSpec {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) throw new Error("Sprite manifest is missing YAML frontmatter.");
  const spec = spriteSpecSchema.parse(parseDocument(match[1]).toJS());
  assertUnique(spec.channels, "channel");
  assertUnique(spec.connections.map((connection) => `${connection.kind}:${connection.id}`), "connection");
  assertUnique(spec.connectors, "connector");
  assertUnique(spec.social, "social connector");
  assertUnique(spec.zaps, "zap");
  return spec;
}

export function serializeSpriteMarkdown(spec: SpriteSpec) {
  const validated = spriteSpecSchema.parse(spec);
  return `---\n${stringify(validated).trimEnd()}\n---\n\n# ${titleize(validated.sprite)}\n\n${validated.description}\n`;
}

export function resolveSpriteSandboxPreset(preset: SpriteSandboxPreset) {
  return spriteSandboxPresets[preset];
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate Sprite ${label}: ${value}.`);
    seen.add(value);
  }
}

function titleize(slug: string) {
  return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
