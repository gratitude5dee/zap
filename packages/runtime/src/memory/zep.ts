import { definePlugin } from "@wzrdtech/zap-kernel";
import { createZepMemory } from "@wzrdtech/zap-memory";
import { z } from "zod";

export interface ZepPluginConfig {
  /** SaaS provider: memory content leaves the VM. Refuses to mount unless true. */
  consent?: boolean;
  apiKey?: string;
  baseUrl?: string;
  /** injected fetch (tests) */
  fetchImpl?: typeof fetch;
}

const schema = z.object({
  consent: z.boolean().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  fetchImpl: z.custom<typeof fetch>((value) => typeof value === "function").optional(),
});

/** Zep SaaS memory plugin; consent gate per the memory locality rule. */
export const zep = definePlugin<ZepPluginConfig>({
  name: "memory.zep",
  schema,
  async apply(ctx, config) {
    const service = createZepMemory({
      consent: config.consent === true,
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });
    await ctx.effect(() => ctx.provide("memory", service));
  },
});
