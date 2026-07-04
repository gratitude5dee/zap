import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    inputs: v.any(),
    runId: v.string(),
    sessionId: v.optional(v.string()),
    userId: v.optional(v.string()),
    zapSlug: v.string(),
    zapVersion: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await ctx.db.insert("runs", {
      costUsd: 0,
      inputs: args.inputs,
      runId: args.runId,
      sessionId: args.sessionId,
      startedAt: Date.now(),
      status: "queued",
      userId: args.userId,
      zapSlug: args.zapSlug,
      zapVersion: args.zapVersion,
    });
    return args.runId;
  },
});

export const get = query({
  args: { runId: v.string() },
  returns: v.object({
    assets: v.array(v.any()),
    feedback: v.array(v.any()),
    run: v.union(v.any(), v.null()),
    steps: v.array(v.any()),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_runId", (q: any) => q.eq("runId", args.runId))
      .unique();
    const steps = await ctx.db
      .query("steps")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .collect();
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .collect();
    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_run", (q: any) => q.eq("runId", args.runId))
      .collect();
    return { assets, feedback, run, steps };
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_startedAt")
      .order("desc")
      .take(Math.min(args.limit ?? 8, 20));

    return await Promise.all(
      runs.map(async (run: any) => {
        const steps = await ctx.db
          .query("steps")
          .withIndex("by_run", (q: any) => q.eq("runId", run.runId))
          .collect();
        const assets = await ctx.db
          .query("assets")
          .withIndex("by_run", (q: any) => q.eq("runId", run.runId))
          .collect();
        const feedback = await ctx.db
          .query("feedback")
          .withIndex("by_run", (q: any) => q.eq("runId", run.runId))
          .collect();
        return { assets, feedback, run, steps };
      }),
    );
  },
});

export const listByZap = query({
  args: { limit: v.optional(v.number()), zapSlug: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_zap", (q: any) => q.eq("zapSlug", args.zapSlug))
      .take(Math.min(args.limit ?? 20, 50));

    return await Promise.all(
      runs.map(async (run: any) => {
        const steps = await ctx.db
          .query("steps")
          .withIndex("by_run", (q: any) => q.eq("runId", run.runId))
          .collect();
        const assets = await ctx.db
          .query("assets")
          .withIndex("by_run", (q: any) => q.eq("runId", run.runId))
          .collect();
        const feedback = await ctx.db
          .query("feedback")
          .withIndex("by_run", (q: any) => q.eq("runId", run.runId))
          .collect();
        return { assets, feedback, run, steps };
      }),
    );
  },
});

export const getAsset = query({
  args: { assetId: v.id("assets") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.assetId);
  },
});

export const updateRun = mutation({
  args: {
    costUsd: v.optional(v.number()),
    error: v.optional(v.string()),
    runId: v.string(),
    stage: v.optional(v.string()),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("waiting"), v.literal("done"), v.literal("failed"), v.literal("canceled")),
    zapUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_runId", (q: any) => q.eq("runId", args.runId))
      .unique();
    if (!run) return null;
    await ctx.db.patch(run._id, {
      costUsd: args.costUsd ?? run.costUsd,
      error: args.error,
      finishedAt: args.status === "done" || args.status === "failed" || args.status === "canceled" ? Date.now() : run.finishedAt,
      stage: args.stage,
      status: args.status,
      zapUrl: args.zapUrl,
    });
    return null;
  },
});

export const upsertStep = mutation({
  args: {
    actualUsd: v.optional(v.number()),
    error: v.optional(v.string()),
    idemKey: v.optional(v.string()),
    kind: v.string(),
    model: v.optional(v.string()),
    priceQuoteUsd: v.number(),
    progress: v.number(),
    provider: v.optional(v.string()),
    providerRequestId: v.optional(v.string()),
    runId: v.string(),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("waiting"), v.literal("done"), v.literal("failed"), v.literal("skipped"), v.literal("canceled")),
    stepId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("steps")
      .withIndex("by_step", (q: any) => q.eq("runId", args.runId).eq("stepId", args.stepId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("steps", args);
    }
    return null;
  },
});

export const addAsset = mutation({
  args: {
    durationS: v.optional(v.number()),
    height: v.optional(v.number()),
    kind: v.union(v.literal("png"), v.literal("mp4"), v.literal("wav"), v.literal("json")),
    parents: v.array(v.string()),
    runId: v.string(),
    stepId: v.string(),
    storageKey: v.optional(v.string()),
    url: v.string(),
    width: v.optional(v.number()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assets")
      .withIndex("by_step", (q: any) => q.eq("runId", args.runId).eq("stepId", args.stepId))
      .filter((q: any) => q.eq(q.field("url"), args.url))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("assets", args);
  },
});
