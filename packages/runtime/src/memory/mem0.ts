import { definePlugin } from "@wzrdtech/zap-kernel";
import { createMem0Memory } from "@wzrdtech/zap-memory";
import { z } from "zod";

export interface Mem0PluginConfig {
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

/** Mem0 SaaS memory plugin; consent gate per the memory locality rule. */
export const mem0 = definePlugin<Mem0PluginConfig>({
  name: "memory.mem0",
  schema,
  async apply(ctx, config) {
    const service = createMem0Memory({
      consent: config.consent === true,
      ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {}),
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });
    await ctx.effect(() => ctx.provide("memory", service));
  },
});
