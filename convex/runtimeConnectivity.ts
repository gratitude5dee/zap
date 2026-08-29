/**
 * Per-runtime connectivity opt-in metadata. Every function is service-token
 * guarded and every argument is a boolean, a coarse status enum, or an
 * identifier: join credentials and message content are structurally
 * unrepresentable here.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireServiceToken } from "./lib/serviceAuth";

const feature = v.union(
  v.literal("tailscale"),
  v.literal("cotal"),
  v.literal("taskrouter"),
  v.literal("samMesh"),
  v.literal("x402"),
);

const featureStatus = v.union(
  v.literal("installed"),
  v.literal("running"),
  v.literal("stopped"),
  v.literal("error"),
);

const ENABLED_FIELD = {
  cotal: "cotalEnabled",
  samMesh: "samMeshEnabled",
  tailscale: "tailscaleEnabled",
  taskrouter: "taskrouterEnabled",
  x402: "x402Enabled",
} as const;

const STATUS_FIELD = {
  cotal: "cotalStatus",
  samMesh: "samMeshStatus",
  tailscale: "tailscaleStatus",
  taskrouter: "taskrouterStatus",
} as const;

export const getByRuntime = query({
  args: { authorId: v.string(), runtimeId: v.string(), serviceToken: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    return await ctx.db
      .query("runtimeConnectivity")
      .withIndex("by_author_runtime", (q) => q.eq("authorId", args.authorId).eq("runtimeId", args.runtimeId))
      .unique();
  },
});

export const listByAuthor = query({
  args: { authorId: v.string(), serviceToken: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    return await ctx.db
      .query("runtimeConnectivity")
      .withIndex("by_author", (q) => q.eq("authorId", args.authorId))
      .collect();
  },
});

/** Records an owner opt-in/opt-out. Absent features keep their stored value. */
export const setOptIn = mutation({
  args: {
    authorId: v.string(),
    enabled: v.boolean(),
    feature,
    runtimeId: v.string(),
    serviceToken: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const now = Date.now();
    const existing = await ctx.db
      .query("runtimeConnectivity")
      .withIndex("by_author_runtime", (q) => q.eq("authorId", args.authorId).eq("runtimeId", args.runtimeId))
      .unique();
    const patch = { [ENABLED_FIELD[args.feature]]: args.enabled, updatedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("runtimeConnectivity", {
      authorId: args.authorId,
      cotalEnabled: false,
      createdAt: now,
      runtimeId: args.runtimeId,
      samMeshEnabled: false,
      tailscaleEnabled: false,
      taskrouterEnabled: false,
      x402Enabled: false,
      ...patch,
    });
  },
});

/** Records the last observed coarse status for one feature. */
export const recordStatus = mutation({
  args: {
    authorId: v.string(),
    feature: v.union(v.literal("tailscale"), v.literal("cotal"), v.literal("taskrouter"), v.literal("samMesh")),
    runtimeId: v.string(),
    serviceToken: v.string(),
    status: featureStatus,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireServiceToken(args.serviceToken);
    const existing = await ctx.db
      .query("runtimeConnectivity")
      .withIndex("by_author_runtime", (q) => q.eq("authorId", args.authorId).eq("runtimeId", args.runtimeId))
      .unique();
    if (!existing) throw new Error("No connectivity record for this runtime; record an opt-in first.");
    const now = Date.now();
    await ctx.db.patch(existing._id, {
      [STATUS_FIELD[args.feature]]: args.status,
      statusAt: now,
      updatedAt: now,
    });
    return null;
  },
});
