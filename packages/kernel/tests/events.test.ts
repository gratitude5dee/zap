import { describe, expect, it } from "vitest";
import { createContext } from "../src/index.ts";

describe("kernel events", () => {
  it("emit is synchronous fire-and-forget", async () => {
    const ctx = createContext();
    const seen: string[] = [];
    ctx.on("run.started", ((id: string) => {
      seen.push(id);
    }) as never);
    ctx.emit("run.started", ...(["run-1"] as never[]));
    expect(seen).toEqual(["run-1"]);
    await ctx.dispose();
  });

  it("emit continues past a throwing listener", async () => {
    const ctx = createContext();
    const seen: string[] = [];
    ctx.on("tick", (() => {
      throw new Error("listener boom");
    }) as never);
    ctx.on("tick", (() => {
      seen.push("second");
    }) as never);
    ctx.emit("tick", ...([] as never[]));
    expect(seen).toEqual(["second"]);
    await ctx.dispose();
  });

  it("parallel awaits all listeners", async () => {
    const ctx = createContext();
    const done: string[] = [];
    ctx.on("flush", (async () => {
      await new Promise((r) => setTimeout(r, 5));
      done.push("slow");
    }) as never);
    ctx.on("flush", (async () => {
      done.push("fast");
    }) as never);
    await ctx.parallel("flush", ...([] as never[]));
    expect(done.sort()).toEqual(["fast", "slow"]);
    await ctx.dispose();
  });

  it("serial runs listeners in order and collects results", async () => {
    const ctx = createContext();
    const order: number[] = [];
    ctx.on("step", (async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push(1);
      return 1;
    }) as never);
    ctx.on("step", (() => {
      order.push(2);
      return 2;
    }) as never);
    const results = await ctx.serial("step", ...([] as never[]));
    expect(order).toEqual([1, 2]);
    expect(results).toEqual([1, 2]);
    await ctx.dispose();
  });

  it("waterfall chains listeners through next()", async () => {
    const ctx = createContext();
    ctx.on("transform", ((value: number, next: (v: number) => number) => next(value + 1)) as never);
    ctx.on("transform", ((value: number, next: (v: number) => number) => {
      void next;
      return value * 10;
    }) as never);
    const result = ctx.waterfall("transform", ...([5] as never[]));
    expect(result).toBe(60);
    await ctx.dispose();
  });

  it("listener disposer unsubscribes", async () => {
    const ctx = createContext();
    const seen: string[] = [];
    const off = ctx.on("ping", (() => {
      seen.push("hit");
    }) as never);
    ctx.emit("ping", ...([] as never[]));
    off();
    ctx.emit("ping", ...([] as never[]));
    expect(seen).toEqual(["hit"]);
    await ctx.dispose();
  });
});
