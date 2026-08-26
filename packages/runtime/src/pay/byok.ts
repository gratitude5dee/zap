import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import { byokStatus } from "../auth/byok.ts";
import { guardHarness, type Payer, type PayService } from "./guard.ts";

export interface PayByokConfig {
  env?: Record<string, string | undefined>;
}

const schema = z
  .object({
    env: z.record(z.string(), z.string().optional()).optional(),
  })
  .optional();

/**
 * BYOK payer: `status() = "byok"` whenever ZAP_PAYER_MODE=byok. Provider keys
 * are resolved at route time (auth/byok.ts) and never logged.
 */
export const payByok = definePlugin<PayByokConfig | undefined>({
  name: "pay.byok",
  schema,
  apply(ctx, config) {
    const env = config?.env ?? {};
    const service: PayService = {
      status() {
        return byokStatus(env);
      },
      payer(): Payer | null {
        return byokStatus(env) === "byok" ? { mode: "byok" } : null;
      },
    };
    ctx.provide("pay", service);
    guardHarness(ctx, service);
  },
});
