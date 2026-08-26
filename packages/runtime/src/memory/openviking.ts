import { definePlugin } from "@wzrdtech/zap-kernel";
import { createOpenVikingMemory, type OpenVikingTransport } from "@wzrdtech/zap-memory";
import { z } from "zod";

export interface OpenVikingPluginConfig {
  /** memory root override; defaults to ~/.zap/memory/openviking */
  path?: string;
  consent?: boolean;
  /** loopback server base url; defaults to http://127.0.0.1:1933 */
  baseUrl?: string;
  /** injected transport (tests) */
  transport?: OpenVikingTransport;
}

const schema = z
  .object({
    path: z.string().optional(),
    consent: z.boolean().optional(),
    baseUrl: z.string().optional(),
    transport: z.custom<OpenVikingTransport>((value) => typeof value === "object" && value !== null).optional(),
  })
  .optional();

/** OpenViking on-VM memory: default provider on the heavy profile, loopback-only. */
export const openviking = definePlugin<OpenVikingPluginConfig | undefined>({
  name: "memory.openviking",
  schema,
  async apply(ctx, config) {
    const service = createOpenVikingMemory({
      ...(config?.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config?.transport !== undefined ? { transport: config.transport } : {}),
    });
    await ctx.effect(() => ctx.provide("memory", service));
  },
});
