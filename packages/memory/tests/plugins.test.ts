import { createContext, PluginFailedError } from "@wzrdtech/zap-kernel";
import { describe, expect, it } from "vitest";
import { mem0 } from "../../runtime/src/memory/mem0.ts";
import { openviking } from "../../runtime/src/memory/openviking.ts";
import { zep } from "../../runtime/src/memory/zep.ts";
import type { MemoryService } from "../src/contract.ts";
import { createInMemoryTransport } from "../src/openviking.ts";
import { createMem0FetchMock, createZepFetchMock } from "./helpers.ts";

describe("runtime memory plugins", () => {
  it("memory.openviking provides an on-vm memory service and withdraws on dispose", async () => {
    const ctx = createContext();
    await ctx.plugin(openviking.plugin, { transport: createInMemoryTransport() });
    const service = await ctx.inject<MemoryService>("memory");
    expect(service.provider).toBe("openviking");
    expect(service.locality).toBe("on-vm");
    await ctx.dispose();
    expect(ctx.get("memory")).toBeUndefined();
  });

  it("memory.mem0 refuses to mount without consent: true", async () => {
    const ctx = createContext();
    await expect(ctx.plugin(mem0.plugin, { fetchImpl: createMem0FetchMock() })).rejects.toThrowError(
      PluginFailedError,
    );
    await ctx.dispose();
  });

  it("memory.mem0 mounts with consent and provides a saas service", async () => {
    const ctx = createContext();
    await ctx.plugin(mem0.plugin, { consent: true, fetchImpl: createMem0FetchMock() });
    const service = await ctx.inject<MemoryService>("memory");
    expect(service.provider).toBe("mem0");
    expect(service.locality).toBe("saas");
    await ctx.dispose();
  });

  it("memory.zep refuses to mount without consent: true", async () => {
    const ctx = createContext();
    await expect(ctx.plugin(zep.plugin, { fetchImpl: createZepFetchMock() })).rejects.toThrowError(
      PluginFailedError,
    );
    await ctx.dispose();
  });

  it("memory.zep mounts with consent", async () => {
    const ctx = createContext();
    await ctx.plugin(zep.plugin, { consent: true, fetchImpl: createZepFetchMock() });
    const service = await ctx.inject<MemoryService>("memory");
    expect(service.provider).toBe("zep");
    await ctx.dispose();
  });
});
