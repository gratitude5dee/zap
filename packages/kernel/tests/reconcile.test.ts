import { describe, expect, it } from "vitest";
import { createRuntime, definePlugin, entryIdOf, planReconcile } from "../src/index.ts";
import type { Context } from "../src/index.ts";

const alpha = definePlugin<{ tag?: string } | undefined>({
  name: "alpha",
  apply(ctx: Context, config) {
    ctx.provide("alpha", config?.tag ?? "alpha");
  },
});
const beta = definePlugin<{ tag?: string } | undefined>({
  name: "beta",
  inject: ["alpha"],
  apply(ctx: Context, config) {
    ctx.provide("beta", config?.tag ?? "beta");
  },
});
const gamma = definePlugin<undefined>({
  name: "gamma",
  apply(ctx: Context) {
    ctx.provide("gamma", "gamma");
  },
});

describe("kernel reconcile", () => {
  it("plugin order permutations yield identical fiber trees", async () => {
    const shape = async (plugins: Parameters<typeof createRuntime>[0]["plugins"]) => {
      const runtime = await createRuntime({ weight: "light", plugins });
      const services = {
        alpha: runtime.ctx.get("alpha"),
        beta: runtime.ctx.get("beta"),
        gamma: runtime.ctx.get("gamma"),
      };
      await runtime.dispose();
      return services;
    };
    const a = await shape([alpha(), beta(), gamma()]);
    const b = await shape([gamma(), beta(), alpha()]);
    const c = await shape([beta(), gamma(), alpha()]);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it("reconcile touches only deltas", async () => {
    const runtime = await createRuntime({ weight: "light", plugins: [alpha(), beta()] });
    const plan = await runtime.reconcile({ weight: "light", plugins: [alpha(), gamma()] });
    expect(plan.mounted).toEqual([entryIdOf(gamma.plugin, undefined)]);
    expect(plan.unmounted).toEqual([entryIdOf(beta.plugin, undefined)]);
    expect(plan.updated).toEqual([]);
    expect(runtime.ctx.get("gamma")).toBe("gamma");
    await runtime.dispose();
  });

  it("entry ids are stable name + config hashes", () => {
    expect(entryIdOf(alpha.plugin, { tag: "x" })).toBe(entryIdOf(alpha.plugin, { tag: "x" }));
    expect(entryIdOf(alpha.plugin, { tag: "x" })).not.toBe(entryIdOf(alpha.plugin, { tag: "y" }));
    expect(alpha({ tag: "x" }).entryId).toContain("alpha#");
  });

  it("planReconcile is pure and order independent", () => {
    const desired = [alpha({ tag: "1" }), gamma()];
    const running = new Map([[alpha({ tag: "1" }).entryId, alpha({ tag: "1" })]]);
    const plan = planReconcile(desired, running);
    expect(plan).toEqual({ mounted: [gamma().entryId], updated: [], unmounted: [] });
  });
});
