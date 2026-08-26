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
  skills: z.array(z.string()).optional(),
  connections: z.array(z.record(z.string(), z.unknown())).optional(),
  env: z.object({ allow: z.array(z.string()).optional() }).optional(),
  lanes: z.array(z.string()).optional(),
});

export type RuntimeSpec = z.infer<typeof runtimeSpecSchema>;

export function parseRuntimeSpec(input: unknown): RuntimeSpec {
  return runtimeSpecSchema.parse(input);
}
