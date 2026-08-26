import { describe, expect, it } from "vitest";
import { createContext } from "../src/index.ts";

describe("kernel fork", () => {
  it("fork isolates effects from the parent", async () => {
    const ctx = createContext();
    const order: string[] = [];
    await ctx.effect(() => () => {
      order.push("parent");
    });
    const child = ctx.fork({ purpose: "run" });
    await child.effect(() => () => {
      order.push("child");
    });
    await child.dispose();
    expect(order).toEqual(["child"]);
    await ctx.dispose();
    expect(order).toEqual(["child", "parent"]);
  });

  it("disposing the child leaves parent services provided", async () => {
    const ctx = createContext();
    ctx.provide("meter", { kind: "meter" });
    const child = ctx.fork();
    expect(child.get("meter")).toEqual({ kind: "meter" });
    await child.dispose();
    expect(ctx.get("meter")).toEqual({ kind: "meter" });
    await ctx.dispose();
  });

  it("disposing the parent disposes children first", async () => {
    const ctx = createContext();
    const order: string[] = [];
    await ctx.effect(() => () => {
      order.push("parent");
    });
    const child = ctx.fork();
    await child.effect(() => () => {
      order.push("child");
    });
    const grandchild = child.fork();
    await grandchild.effect(() => () => {
      order.push("grandchild");
    });
    await ctx.dispose();
    expect(order).toEqual(["grandchild", "child", "parent"]);
    expect(child.state).toBe("DISPOSED");
    expect(grandchild.state).toBe("DISPOSED");
  });

  it("isolate gives a subtree its own resolution of a key", async () => {
    const ctx = createContext();
    ctx.provide("sandbox", "parent-sandbox");
    const realm = ctx.isolate(["sandbox"]);
    expect(realm.get("sandbox")).toBeUndefined();
    realm.provide("sandbox", "isolated-sandbox");
    expect(realm.get("sandbox")).toBe("isolated-sandbox");
    expect(ctx.get("sandbox")).toBe("parent-sandbox");
    // non-isolated keys still resolve through the parent
    ctx.provide("meter", "shared-meter");
    expect(realm.get("meter")).toBe("shared-meter");
    await ctx.dispose();
  });
});
