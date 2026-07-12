import { z } from "zod";
import registryIndexJson from "@/registry/zaps/index.json";

export const zapRegistryEntrySchema = z.object({
  budget: z.object({
    cap_usd: z.number().positive(),
    estimate_usd: z.number().nonnegative(),
  }),
  description: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()),
  providers: z.array(z.string()).min(1),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  tags: z.array(z.string()),
  title: z.string().min(1),
});

export const zapRegistryIndexSchema = z.object({
  version: z.literal(1),
  zaps: z.array(zapRegistryEntrySchema),
});

export type ZapRegistryEntry = z.infer<typeof zapRegistryEntrySchema>;
export type ZapRegistryIndex = z.infer<typeof zapRegistryIndexSchema>;

export const canonicalZapRegistryIndex = zapRegistryIndexSchema.parse(registryIndexJson);

export function searchZapRegistry(query = "", index: ZapRegistryIndex = canonicalZapRegistryIndex) {
  const terms = normalizeQuery(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return index.zaps;
  return index.zaps.filter((entry) => {
    const haystack = normalizeQuery([
      entry.slug,
      entry.title,
      entry.description,
      ...entry.providers,
      ...entry.tags,
      ...Object.keys(entry.inputs),
    ].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
}

function normalizeQuery(value: string) {
  return value.normalize("NFKD").toLowerCase();
}
