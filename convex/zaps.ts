import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireServiceToken } from "./lib/serviceAuth";

export const list = query({
  args: { status: v.optional(v.union(v.literal("draft"), v.literal("published"))) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    if (args.status === "draft") return [];
    const sortNewest = (rows: any[]) => rows.sort((left, right) =>
      (right.finalizedAt ?? right.updatedAt ?? right.createdAt ?? 0) - (left.finalizedAt ?? left.updatedAt ?? left.createdAt ?? 0),
    );
    const rows = await ctx.db.query("zaps").withIndex("by_status", (q: any) => q.eq("status", "published")).collect();
    return sortNewest(rows.filter((row: any) => row.visibility !== "private"));
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
    if (!row) return null;
    return row.status === "published" && row.visibility !== "private" ? row : null;
  },
});

export const getOwnedBySlug = query({
  args: { authorId: v.string(), serviceToken: v.string(), slug: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const row = await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
    return row?.authorId === args.authorId ? row : null;
  },
});

export const listByAuthor = query({
  args: { authorId: v.string(), serviceToken: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    return await ctx.db.query("zaps").withIndex("by_author", (q: any) => q.eq("authorId", args.authorId)).collect();
  },
});

export const upsert = mutation({
  args: {
    authorId: v.optional(v.string()),
    compiledFromRunId: v.optional(v.string()),
    description: v.optional(v.string()),
    estimateUsd: v.number(),
    finalizedAt: v.optional(v.number()),
    finalizedBy: v.optional(v.string()),
    heroAssetUrl: v.optional(v.string()),
    slug: v.string(),
    source: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    tags: v.array(v.string()),
    title: v.optional(v.string()),
    version: v.number(),
    visibility: v.optional(v.union(v.literal("private"), v.literal("public"))),
    serviceToken: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const { serviceToken: _serviceToken, ...record } = args;
    const now = Date.now();
    const existing = await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
    if (existing) {
      if (existing.authorId && args.authorId && existing.authorId !== args.authorId) {
        throw new Error(`Zap ${args.slug} belongs to another creator.`);
      }
      await ctx.db.patch(existing._id, { ...record, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("zaps", { ...record, createdAt: now, updatedAt: now });
  },
});

export const finalize = mutation({
  args: {
    authorId: v.optional(v.string()),
    compiledFromRunId: v.optional(v.string()),
    description: v.optional(v.string()),
    finalizedBy: v.optional(v.string()),
    heroAssetUrl: v.optional(v.string()),
    slug: v.string(),
    tags: v.optional(v.array(v.string())),
    title: v.optional(v.string()),
    serviceToken: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const existing = await ctx.db.query("zaps").withIndex("by_slug", (q: any) => q.eq("slug", args.slug)).unique();
    if (!existing) throw new Error(`Zap ${args.slug} does not exist.`);
    await ctx.db.patch(existing._id, {
      authorId: args.authorId ?? existing.authorId,
      compiledFromRunId: args.compiledFromRunId ?? existing.compiledFromRunId,
      description: args.description ?? existing.description,
      finalizedAt: Date.now(),
      finalizedBy: args.finalizedBy ?? args.authorId ?? existing.finalizedBy,
      heroAssetUrl: args.heroAssetUrl ?? existing.heroAssetUrl,
      status: "published",
      tags: args.tags ?? existing.tags,
      title: args.title ?? existing.title,
      updatedAt: Date.now(),
      visibility: "public",
    });
    return existing._id;
  },
});
