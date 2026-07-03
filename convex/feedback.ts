import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    comment: v.optional(v.string()),
    kind: v.union(v.literal("rlhf_vote"), v.literal("judge_score")),
    rater: v.union(v.literal("human"), v.literal("vlm")),
    runId: v.string(),
    scores: v.any(),
    stepId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await ctx.db.insert("feedback", args);
  },
});
