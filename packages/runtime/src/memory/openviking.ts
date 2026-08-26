import { definePlugin, NotImplementedError } from "@wzrdtech/zap-kernel";
import { z } from "zod";

export interface OpenVikingPluginConfig {
  path?: string;
  consent?: boolean;
}

const schema = z
  .object({
    path: z.string().optional(),
    consent: z.boolean().optional(),
  })
  .optional();

/** OpenViking on-VM memory plugin. Typed stub at Z0; session D lands the body in Z4. */
export const openviking = definePlugin<OpenVikingPluginConfig | undefined>({
  name: "memory.openviking",
  schema,
  apply() {
    throw new NotImplementedError("memory.openviking (session D, Z4)");
  },
});
