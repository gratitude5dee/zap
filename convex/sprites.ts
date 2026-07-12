import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServiceToken } from "./lib/serviceAuth";

const status = v.union(
  v.literal("draft"),
  v.literal("deploying"),
  v.literal("ready"),
  v.literal("error"),
);

export const getByAuthor = query({
  args: { authorId: v.string(), serviceToken: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    return await ctx.db.query("sprites").withIndex("by_author", (q) => q.eq("authorId", args.authorId)).unique();
  },
});

export const upsert = mutation({
  args: {
    authorId: v.string(),
    composioMcpUrl: v.optional(v.string()),
    composioSessionId: v.optional(v.string()),
    composioUserId: v.string(),
    manifest: v.string(),
    serviceToken: v.string(),
    slug: v.string(),
    status,
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const { serviceToken: _serviceToken, ...record } = args;
    const existing = await ctx.db.query("sprites").withIndex("by_author", (q) => q.eq("authorId", args.authorId)).unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...record, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("sprites", { ...record, createdAt: now, updatedAt: now });
  },
});

export const updateDeployment = mutation({
  args: {
    authorId: v.string(),
    composioMcpUrl: v.optional(v.string()),
    composioSessionId: v.optional(v.string()),
    deploymentError: v.optional(v.string()),
    deploymentId: v.optional(v.string()),
    deploymentUrl: v.optional(v.string()),
    projectId: v.optional(v.string()),
    projectName: v.optional(v.string()),
    serviceToken: v.string(),
    status,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const existing = await ctx.db.query("sprites").withIndex("by_author", (q) => q.eq("authorId", args.authorId)).unique();
    if (!existing) throw new Error("Sprite does not exist.");
    const { authorId: _authorId, serviceToken: _serviceToken, ...patch } = args;
    await ctx.db.patch(existing._id, { ...patch, updatedAt: Date.now() });
    return null;
  },
});
