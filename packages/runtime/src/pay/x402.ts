import { definePlugin, NotImplementedError } from "@wzrdtech/zap-kernel";
import { z } from "zod";

export interface X402PluginConfig {
  chain: "base" | "base-sepolia";
}

const schema = z.object({
  chain: z.enum(["base", "base-sepolia"]),
});

/** x402 payment plugin. Typed stub at Z0; session H lands the body in Z9. */
export const x402 = definePlugin<X402PluginConfig>({
  name: "pay.x402",
  schema,
  apply() {
    throw new NotImplementedError("pay.x402 (session H, Z9)");
  },
});
