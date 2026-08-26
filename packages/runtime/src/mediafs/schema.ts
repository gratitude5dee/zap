import { z } from "zod";

export const mediaKindSchema = z.enum(["image", "audio", "video", "3d"]);
export type MediaKind = z.infer<typeof mediaKindSchema>;

export const mediaSidecarSchema = z.object({
  schema: z.literal(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  kind: mediaKindSchema,
  mime: z.string(),
  bytes: z.number().int().nonnegative(),
  createdAt: z.string(),
  runId: z.string().optional(),
  stepId: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  parents: z.array(z.string()).optional(),
  ffmpegPreset: z.string().optional(),
  usd: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationS: z.number().optional(),
});

export type MediaSidecar = z.infer<typeof mediaSidecarSchema>;
