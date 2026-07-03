import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { status: v.optional(v.union(v.literal("draft"), v.literal("published"))) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db.query("zaps").withIndex("by_status", (q: any) => q.eq("status", args.status)).collect();
    }
    return await ctx.db.query("zaps").collect();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
  },
});

export const upsert = mutation({
  args: {
    authorId: v.optional(v.string()),
    estimateUsd: v.number(),
    slug: v.string(),
    source: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    tags: v.array(v.string()),
    version: v.number(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("zaps", args);
  },
});
