import { describe, expect, it } from "vitest";
import { createContext } from "../src/index.ts";

describe("kernel leak", () => {
  it("1000 fork/dispose cycles leave no leaked disposers or children", async () => {
    const ctx = createContext();
    let live = 0;
    for (let i = 0; i < 1000; i += 1) {
      const child = ctx.fork({ purpose: `run-${i}` });
      live += 1;
      await child.effect(() => () => {
        live -= 1;
      });
      child.provide(`scoped-${i % 7}`, i);
      await child.dispose();
      expect(child.state).toBe("DISPOSED");
    }
    expect(live).toBe(0);
    // parent still healthy and disposes cleanly with no residue
    let parentDisposed = 0;
    await ctx.effect(() => () => {
      parentDisposed += 1;
    });
    await ctx.dispose();
    expect(parentDisposed).toBe(1);
  });
});
