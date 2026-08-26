import { describe, expect, it } from "vitest";
import { createContext, createRuntime, definePlugin } from "../src/index.ts";
import type { Context, FiberState } from "../src/index.ts";

describe("kernel inject", () => {
  it("inject waits until the service is provided", async () => {
    const ctx = createContext();
    const pending = ctx.inject<string>("late-service");
    let resolved = false;
    void pending.then(() => {
      resolved = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(resolved).toBe(false);
    ctx.provide("late-service", "here");
    await expect(pending).resolves.toBe("here");
    await ctx.dispose();
  });

  it("missing service fails closed on dispose with SERVICE_MISSING", async () => {
    const ctx = createContext();
    const pending = ctx.inject("never-provided");
    const assertion = expect(pending).rejects.toMatchObject({ code: "SERVICE_MISSING" });
    await ctx.dispose();
    await assertion;
  });

  it("a fiber stays PENDING until its inject set is ACTIVE", async () => {
    const states: FiberState[] = [];
    const consumer = definePlugin<undefined>({
      name: "consumer",
      inject: ["dep"],
      apply(ctx: Context) {
        states.push("ACTIVE");
        void ctx;
      },
    });
    const provider = definePlugin<undefined>({
      name: "provider",
      apply(ctx: Context) {
        ctx.provide("dep", { ok: true });
      },
    });
    const runtime = await createRuntime({ weight: "light", plugins: [consumer(), provider()] });
    expect(states).toEqual(["ACTIVE"]);
    await runtime.dispose();
  });

  it("provider replacement cycles consumers UNLOADING->LOADING with the committed view", async () => {
    const ctx = createContext();
    ctx.provide("dep", "v1");
    const observed: string[] = [];
    const transitions: FiberState[] = [];
    const consumer = {
      name: "consumer",
      inject: ["dep"] as const,
      async apply(c: Context) {
        observed.push(c.get<string>("dep") ?? "missing");
        await c.effect(() => () => {
          observed.push(`disposed-while-${c.get<string>("dep") ?? "missing"}`);
        });
      },
    };
    const fiber = await ctx.plugin(consumer);
    transitions.push(fiber.state);
    expect(observed).toEqual(["v1"]);
    expect(fiber.committed.get("dep")).toBeTruthy();
    const before = fiber.committed.get("dep");

    ctx.provide("dep", "v2");
    await ctx.ready();
    transitions.push(fiber.state);
    expect(observed).toEqual(["v1", "disposed-while-v2", "v2"]);
    expect(fiber.committed.get("dep")).not.toBe(before);
    expect(transitions).toEqual(["ACTIVE", "ACTIVE"]);
    await ctx.dispose();
  });

  it("a failing plugin recovers its collected effects and reports FAILED", async () => {
    const ctx = createContext();
    const cleaned: string[] = [];
    const bad = {
      name: "bad",
      async apply(c: Context) {
        await c.effect(() => () => {
          cleaned.push("recovered");
        });
        throw new Error("apply exploded");
      },
    };
    await expect(ctx.plugin(bad)).rejects.toMatchObject({ code: "PLUGIN_FAILED", plugin: "bad" });
    expect(cleaned).toEqual(["recovered"]);
    await ctx.dispose();
  });

  it("createRuntime fails with CYCLE_DETECTED when no provider can satisfy the graph", async () => {
    const a = definePlugin<undefined>({
      name: "needs-b",
      inject: ["service-b"],
      apply(ctx: Context) {
        ctx.provide("service-a", 1);
      },
    });
    const b = definePlugin<undefined>({
      name: "needs-a",
      inject: ["service-a"],
      apply(ctx: Context) {
        ctx.provide("service-b", 2);
      },
    });
    await expect(createRuntime({ weight: "light", plugins: [a(), b()] })).rejects.toMatchObject({
      code: "CYCLE_DETECTED",
    });
  });

  it("intercept wraps resolution without changing satisfaction", async () => {
    const ctx = createContext();
    ctx.provide("meter", { calls: 0 });
    const undo = ctx.intercept<{ calls: number }>("meter", (svc) => ({ calls: svc.calls + 100 }));
    expect(ctx.get<{ calls: number }>("meter")?.calls).toBe(100);
    undo();
    expect(ctx.get<{ calls: number }>("meter")?.calls).toBe(0);
    await ctx.dispose();
  });
});
