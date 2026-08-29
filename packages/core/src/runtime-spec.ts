import { parseDocument, stringify } from "yaml";
import { z } from "zod";

/** Runtime.md frontmatter schema (skeleton at Z0; session C extends it in Z3). */
export const runtimeSpecSchema = z.object({
  runtime: z.string(),
  version: z.number().int().min(1),
  weight: z.enum(["light", "med", "heavy"]),
  sandbox: z
    .object({
      provider: z.string(),
      template: z.string().optional(),
      size: z.string().optional(),
      environment: z.string().optional(),
      idleStopMinutes: z.number().int().min(0).optional(),
    })
    .optional(),
  memory: z
    .object({
      provider: z.string(),
      consent: z.boolean().optional(),
    })
    .optional(),
  gateway: z
    .object({
      llm: z.string().optional(),
      model: z.string().optional(),
      media: z.array(z.string()).optional(),
    })
    .optional(),
  harness: z
    .object({
      id: z.string(),
      profile: z.string().optional(),
    })
    .optional(),
  pay: z
    .object({
      mode: z.enum(["byok", "managed"]),
      keysInRuntime: z.boolean().optional(),
    })
    .optional(),
  // Opt-in connectivity. Every field defaults to false: a runtime that says
  // nothing gets a box where these are installed but disabled. `samMesh` and
  // `tailscale` only ever join the owner's own networks, with credentials
  // supplied at enable time — never declared here.
  connectivity: z
    .object({
      tailscale: z.boolean().default(false),
      cotal: z.boolean().default(false),
      taskrouter: z.boolean().default(false),
      samMesh: z.boolean().default(false),
      /** Advertise this runtime's exec endpoint behind the managed x402 gate. */
      x402: z.boolean().default(false),
    })
    .optional(),
  skills: z.array(z.string()).optional(),
  connections: z.array(z.record(z.string(), z.unknown())).optional(),
  env: z.object({ allow: z.array(z.string()).optional() }).optional(),
  lanes: z.array(z.string()).optional(),
});

export type RuntimeSpec = z.infer<typeof runtimeSpecSchema>;

export type RuntimeConnectivity = NonNullable<RuntimeSpec["connectivity"]>;

export const CONNECTIVITY_DEFAULTS: RuntimeConnectivity = {
  cotal: false,
  samMesh: false,
  tailscale: false,
  taskrouter: false,
  x402: false,
};

export function parseRuntimeSpec(input: unknown): RuntimeSpec {
  return runtimeSpecSchema.parse(input);
}

/** The effective opt-in flags for a runtime — all false unless declared. */
export function resolveConnectivity(spec: RuntimeSpec): RuntimeConnectivity {
  return { ...CONNECTIVITY_DEFAULTS, ...(spec.connectivity ?? {}) };
}

/** Parses `Runtime.md` (YAML frontmatter + body) into a validated spec. */
export function parseRuntimeMarkdown(content: string): { spec: RuntimeSpec; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("Runtime.md has no YAML frontmatter.");
  const raw: unknown = parseDocument(match[1]).toJS();
  return { body: match[2] ?? "", spec: parseRuntimeSpec(raw) };
}

/** Serializes a spec back to `Runtime.md`. Round-trips `parseRuntimeMarkdown`. */
export function serializeRuntimeMarkdown(spec: RuntimeSpec, body = ""): string {
  const frontmatter = stringify(spec, { lineWidth: 0 }).trimEnd();
  const trimmed = body.replace(/^\n+/, "").trimEnd();
  return trimmed === "" ? `---\n${frontmatter}\n---\n` : `---\n${frontmatter}\n---\n\n${trimmed}\n`;
}
