import { definePlugin, NotImplementedError } from "@wzrdtech/zap-kernel";
import { z } from "zod";

export interface HermesPluginConfig {
  profile?: string;
}

const schema = z
  .object({
    profile: z.string().optional(),
  })
  .optional();

/** Hermes harness plugin. Typed stub at Z0; session E lands the body in Z6. */
export const hermes = definePlugin<HermesPluginConfig | undefined>({
  name: "harness.hermes",
  inject: ["sandbox"],
  schema,
  apply() {
    throw new NotImplementedError("harness.hermes (session E, Z6)");
  },
});
