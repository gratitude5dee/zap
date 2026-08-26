import { definePlugin } from "@wzrdtech/zap-kernel";
import { z } from "zod";
import { loadSessionKey } from "../auth/managed.ts";
import { guardHarness, type Payer, type PayService } from "./guard.ts";

export interface X402PluginConfig {
  chain: "base" | "base-sepolia";
  /** environment accessor override; defaults to an empty environment. */
  env?: Record<string, string | undefined>;
  /** `.zap` directory holding the managed session key (auth.json). */
  zapDir?: string;
}

const schema = z.object({
  chain: z.enum(["base", "base-sepolia"]),
  env: z.record(z.string(), z.string().optional()).optional(),
  zapDir: z.string().optional(),
});

export const X402_NETWORKS: Record<X402PluginConfig["chain"], string> = {
  base: "eip155:8453",
  "base-sepolia": "eip155:84532",
};

export interface ManagedPayService extends PayService {
  network(): string;
}

/**
 * Managed payer: pays per request via x402 v2 / MPP through the cloud gate.
 * The signer is the user's wallet or a scoped session key (`zap pay login
 * --managed`); Zap never custodies funds — `payTo` is always the treasury.
 */
export const x402 = definePlugin<X402PluginConfig>({
  name: "pay.x402",
  schema,
  async apply(ctx, config) {
    const env = config.env ?? {};
    let address = env.ZAP_WALLET_ADDRESS;
    if (!address) {
      const session = await loadSessionKey({ zapDir: config.zapDir }).catch(() => null);
      if (session) address = session.address;
    }
    const service: ManagedPayService = {
      status() {
        return address ? "managed" : "missing";
      },
      payer(): Payer | null {
        return address ? { mode: "managed", address } : null;
      },
      network() {
        return X402_NETWORKS[config.chain];
      },
    };
    ctx.provide("pay", service);
    guardHarness(ctx, service);
  },
});
