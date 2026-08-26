import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import type { SandboxService } from "../../contract.ts";
import { BASETEN_MANIFEST, basetenStub } from "./baseten.ts";
import { BLAXEL_MANIFEST, blaxelStub } from "./blaxel.ts";
import { FREESTYLE_MANIFEST, freestyleStub } from "./freestyle.ts";
import { ORGO_MANIFEST, orgoStub } from "./orgo.ts";
import { RUNPOD_MANIFEST, runpodStub } from "./runpod.ts";
import { CatalogStubError, createCatalogStub, STUB_CAPABILITIES, type CatalogManifest } from "./stub.ts";
import { TENSORLAKE_MANIFEST, tensorlakeStub } from "./tensorlake.ts";

export { CatalogStubError, createCatalogStub, STUB_CAPABILITIES, type CatalogManifest };
export { BASETEN_MANIFEST, basetenStub };
export { BLAXEL_MANIFEST, blaxelStub };
export { FREESTYLE_MANIFEST, freestyleStub };
export { ORGO_MANIFEST, orgoStub };
export { RUNPOD_MANIFEST, runpodStub };
export { TENSORLAKE_MANIFEST, tensorlakeStub };

export const CATALOG_MANIFESTS: readonly CatalogManifest[] = [
  RUNPOD_MANIFEST,
  BLAXEL_MANIFEST,
  FREESTYLE_MANIFEST,
  ORGO_MANIFEST,
  TENSORLAKE_MANIFEST,
  BASETEN_MANIFEST,
];

export const CATALOG_STUBS = [
  runpodStub,
  blaxelStub,
  freestyleStub,
  orgoStub,
  tensorlakeStub,
  basetenStub,
] as const;

const schema = z.object({}).optional() as z.ZodType<Record<string, never> | undefined>;

/** `sandbox.catalog` — registers every catalog stub so `doctor --json` lists them. */
export const catalogStubs = definePlugin<Record<string, never> | undefined>({
  name: "sandbox.catalog",
  inject: ["sandbox"],
  schema,
  async apply(ctx) {
    const sandbox = await ctx.inject<SandboxService>("sandbox");
    for (const provider of CATALOG_STUBS) {
      await ctx.effect(() => sandbox.register(provider));
    }
  },
});
