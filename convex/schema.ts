import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  assets: defineTable({
    durationS: v.optional(v.number()),
    height: v.optional(v.number()),
    kind: v.union(v.literal("png"), v.literal("mp4"), v.literal("wav"), v.literal("json")),
    parents: v.array(v.string()),
    runId: v.string(),
    stepId: v.string(),
    storageKey: v.optional(v.string()),
    url: v.string(),
    width: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_step", ["runId", "stepId"]),

  cronLogs: defineTable({
    duration: v.number(),
    endTime: v.number(),
    error: v.optional(v.string()),
    errorCount: v.number(),
    jobName: v.string(),
    processedCount: v.number(),
    startTime: v.number(),
    status: v.union(v.literal("success"), v.literal("partial"), v.literal("failed")),
  })
    .index("by_job", ["jobName"])
    .index("by_startTime", ["startTime"])
    .index("by_status", ["status"]),

  feedback: defineTable({
    comment: v.optional(v.string()),
    kind: v.union(v.literal("rlhf_vote"), v.literal("judge_score")),
    rater: v.union(v.literal("human"), v.literal("vlm")),
    runId: v.string(),
    scores: v.any(),
    stepId: v.optional(v.string()),
  })
    .index("by_run", ["runId"])
    .index("by_step", ["runId", "stepId"]),

  runs: defineTable({
    costUsd: v.number(),
    error: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    inputs: v.any(),
    runId: v.string(),
    sessionId: v.optional(v.string()),
    stage: v.optional(v.string()),
    startedAt: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("waiting"),
      v.literal("done"),
      v.literal("failed"),
    ),
    userId: v.optional(v.string()),
    zapSlug: v.string(),
    zapUrl: v.optional(v.string()),
    zapVersion: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_status", ["status"])
    .index("by_zap", ["zapSlug"]),

  steps: defineTable({
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
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    stepId: v.string(),
  })
    .index("by_run", ["runId"])
    .index("by_step", ["runId", "stepId"])
    .index("by_status", ["status"]),

  zaps: defineTable({
    authorId: v.optional(v.string()),
    estimateUsd: v.number(),
    slug: v.string(),
    source: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    tags: v.array(v.string()),
    version: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),
});
