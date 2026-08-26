import { describe, expect, it } from "vitest";
import { createContext, DisposedError } from "../src/index.ts";

describe("kernel dispose", () => {
  it("dispose is idempotent", async () => {
    const ctx = createContext();
    let count = 0;
    await ctx.effect(() => () => {
      count += 1;
    });
    await ctx.dispose();
    await ctx.dispose();
    await ctx.dispose();
    expect(count).toBe(1);
    expect(ctx.state).toBe("DISPOSED");
  });

  it("operations after dispose throw DISPOSED", async () => {
    const ctx = createContext();
    await ctx.dispose();
    await expect(ctx.effect(() => undefined)).rejects.toMatchObject({ code: "DISPOSED" });
    expect(() => ctx.provide("x", 1)).toThrow(DisposedError);
    expect(() => ctx.fork()).toThrow(DisposedError);
    expect(() => ctx.isolate(["x"])).toThrow(DisposedError);
    await expect(ctx.plugin({ name: "late", apply() {} })).rejects.toMatchObject({ code: "DISPOSED" });
    await expect(ctx.inject("x")).rejects.toMatchObject({ code: "DISPOSED" });
  });
});
