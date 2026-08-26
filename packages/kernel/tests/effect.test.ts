import { describe, expect, it, vi } from "vitest";
import { createContext } from "../src/index.ts";

describe("kernel effects", () => {
  it("runs disposers in reverse registration order", async () => {
    const ctx = createContext();
    const order: number[] = [];
    await ctx.effect(() => () => {
      order.push(1);
    });
    await ctx.effect(() => () => {
      order.push(2);
    });
    await ctx.effect(() => () => {
      order.push(3);
    });
    await ctx.dispose();
    expect(order).toEqual([3, 2, 1]);
  });

  it("awaits async disposers", async () => {
    const ctx = createContext();
    const order: string[] = [];
    await ctx.effect(() => async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("slow");
    });
    await ctx.effect(() => () => {
      order.push("fast");
    });
    await ctx.dispose();
    expect(order).toEqual(["fast", "slow"]);
  });

  it("a throwing disposer does not skip the rest and is reported", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const ctx = createContext();
      const order: string[] = [];
      await ctx.effect(() => () => {
        order.push("first-registered");
      });
      await ctx.effect(() => () => {
        throw new Error("boom");
      });
      await ctx.effect(() => () => {
        order.push("last-registered");
      });
      await ctx.dispose();
      expect(order).toEqual(["last-registered", "first-registered"]);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("setup without a disposer is allowed", async () => {
    const ctx = createContext();
    let ran = false;
    await ctx.effect(() => {
      ran = true;
    });
    await ctx.dispose();
    expect(ran).toBe(true);
  });
});
