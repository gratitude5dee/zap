import { definePlugin, NotImplementedError } from "@wzrdtech/zap-kernel";
import { z } from "zod";

export interface BoxPluginConfig {
  template: string;
  size?: "small" | "default" | "large";
}

const schema = z.object({
  template: z.string(),
  size: z.enum(["small", "default", "large"]).optional(),
});

/** Box sandbox adapter plugin. Typed stub at Z0; session B lands the body in Z2. */
export const box = definePlugin<BoxPluginConfig>({
  name: "sandbox.box",
  inject: ["sandbox", "meter"],
  schema,
  apply() {
    throw new NotImplementedError("sandbox.box (session B, Z2)");
  },
});
