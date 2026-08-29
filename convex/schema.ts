import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Coarse, non-secret connectivity state for one feature. */
const connectivityStatusValue = v.union(
  v.literal("installed"),
  v.literal("running"),
  v.literal("stopped"),
  v.literal("error"),
);

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
    assetId: v.optional(v.string()),
    comment: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    kind: v.union(v.literal("rlhf_vote"), v.literal("judge_score"), v.literal("aura_score")),
    rater: v.union(v.literal("heuristic"), v.literal("human"), v.literal("vlm")),
    runId: v.string(),
    scores: v.any(),
    stepId: v.optional(v.string()),
  })
    .index("by_run", ["runId"])
    .index("by_step", ["runId", "stepId"]),

  runs: defineTable({
    credentialMode: v.optional(v.union(v.literal("byok"), v.literal("wzrd-cloud"))),
    costUsd: v.number(),
    error: v.optional(v.string()),
    finishedAt: v.optional(v.number()),
    inputs: v.any(),
    llmModel: v.optional(v.string()),
    llmRoute: v.optional(v.union(
      v.literal("gateway"),
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("openrouter"),
    )),
    principalId: v.optional(v.string()),
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
      v.literal("canceled"),
    ),
    userId: v.optional(v.string()),
    zapSlug: v.string(),
    zapUrl: v.optional(v.string()),
    zapVersion: v.number(),
  })
    .index("by_runId", ["runId"])
    .index("by_principal", ["principalId"])
    .index("by_startedAt", ["startedAt"])
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
      v.literal("waiting"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("skipped"),
      v.literal("canceled"),
    ),
    stepId: v.string(),
  })
    .index("by_run", ["runId"])
    .index("by_step", ["runId", "stepId"])
    .index("by_status", ["status"]),

  sprites: defineTable({
    authorId: v.string(),
    composioMcpUrl: v.optional(v.string()),
    composioSessionId: v.optional(v.string()),
    composioUserId: v.string(),
    createdAt: v.number(),
    deploymentError: v.optional(v.string()),
    deploymentId: v.optional(v.string()),
    deploymentUrl: v.optional(v.string()),
    manifest: v.string(),
    projectId: v.optional(v.string()),
    projectName: v.optional(v.string()),
    slug: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("deploying"),
      v.literal("ready"),
      v.literal("error"),
    ),
    updatedAt: v.number(),
  })
    .index("by_author", ["authorId"])
    .index("by_deployment", ["deploymentId"])
    .index("by_slug", ["slug"]),

  // Per-runtime connectivity opt-in state. Metadata only: booleans, enum-like
  // status strings, and timestamps. Join credentials (Tailscale auth keys, SAM
  // bootstrap tokens, mesh invite tokens), control-plane URLs, and any message
  // or provider content never reach this table.
  runtimeConnectivity: defineTable({
    authorId: v.string(),
    cotalEnabled: v.boolean(),
    cotalStatus: v.optional(connectivityStatusValue),
    createdAt: v.number(),
    runtimeId: v.string(),
    samMeshEnabled: v.boolean(),
    samMeshStatus: v.optional(connectivityStatusValue),
    statusAt: v.optional(v.number()),
    tailscaleEnabled: v.boolean(),
    tailscaleStatus: v.optional(connectivityStatusValue),
    taskrouterEnabled: v.boolean(),
    taskrouterStatus: v.optional(connectivityStatusValue),
    updatedAt: v.number(),
    x402Enabled: v.boolean(),
  })
    .index("by_runtime", ["runtimeId"])
    .index("by_author", ["authorId"])
    .index("by_author_runtime", ["authorId", "runtimeId"]),

  zaps: defineTable({
    authorId: v.optional(v.string()),
    compiledFromRunId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
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
    updatedAt: v.optional(v.number()),
    version: v.number(),
    visibility: v.optional(v.union(v.literal("private"), v.literal("public"))),
  })
    .index("by_slug", ["slug"])
    .index("by_author", ["authorId"])
    .index("by_author_status", ["authorId", "status"])
    .index("by_status", ["status"]),
});
