import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { convexServiceToken } from "./convex-service";
import type { LlmRoute } from "./llm-route";
import type { ZapCredentialMode } from "./zap-run-auth";
import type { ZapStep } from "./zap-schema";

type RunStatus = "queued" | "running" | "waiting" | "done" | "failed" | "canceled";
type StepStatus = "queued" | "running" | "waiting" | "done" | "failed" | "skipped" | "canceled";
type AssetKind = "png" | "mp4" | "wav" | "json";

export type LedgerRun = {
  credentialMode?: ZapCredentialMode;
  costUsd: number;
  error?: string;
  finishedAt?: number;
  inputs: unknown;
  llmModel?: string;
  llmRoute?: LlmRoute;
  principalId?: string;
  runId: string;
  sessionId?: string;
  stage?: string;
  startedAt: number;
  status: RunStatus;
  userId?: string;
  zapSlug: string;
  zapUrl?: string;
  zapVersion: number;
};

export type LedgerStep = {
  actualUsd?: number;
  error?: string;
  idemKey?: string;
  kind: string;
  model?: string;
  priceQuoteUsd: number;
  progress: number;
  provider?: string;
  providerRequestId?: string;
  runId: string;
  status: StepStatus;
  stepId: string;
};

export type LedgerAsset = {
  _id?: string;
  durationS?: number;
  height?: number;
  kind: AssetKind;
  parents: string[];
  runId: string;
  stepId: string;
  storageKey?: string;
  url: string;
  width?: number;
};

export type LedgerFeedback = {
  _id?: string;
  assetId?: string;
  comment?: string;
  createdAt: number;
  kind: "rlhf_vote" | "judge_score" | "aura_score";
  rater: "heuristic" | "human" | "vlm";
  runId: string;
  scores: unknown;
  stepId?: string;
};

export type RunSnapshot = {
  assets: LedgerAsset[];
  feedback: LedgerFeedback[];
  remainingBudgetUsd?: number;
  run: LedgerRun | null;
  statusUrl: string;
  steps: LedgerStep[];
};

const createRun = makeFunctionReference<"mutation">("runs:create");
const updateRunMutation = makeFunctionReference<"mutation">("runs:updateRun");
const upsertStepMutation = makeFunctionReference<"mutation">("runs:upsertStep");
const addAssetMutation = makeFunctionReference<"mutation">("runs:addAsset");
const redactAirVideoAssetMutation = makeFunctionReference<"mutation">("runs:redactAirVideoAsset");
const addFeedbackMutation = makeFunctionReference<"mutation">("feedback:add");
const getAssetQuery = makeFunctionReference<"query">("runs:getAsset");
const getRunQuery = makeFunctionReference<"query">("runs:get");

const memoryRuns = new Map<string, LedgerRun>();
const memorySteps = new Map<string, LedgerStep>();
const memoryAssets = new Map<string, LedgerAsset>();
const memoryFeedback = new Map<string, LedgerFeedback>();

let convexClient: ConvexHttpClient | null | undefined;

export async function createRunLedger(args: {
  credentialMode?: ZapCredentialMode;
  inputs: unknown;
  llmModel?: string;
  llmRoute?: LlmRoute;
  principalId?: string;
  runId: string;
  sessionId?: string;
  userId?: string;
  zapSlug: string;
  zapVersion: number;
}) {
  const run: LedgerRun = {
    credentialMode: args.credentialMode,
    costUsd: 0,
    inputs: args.inputs,
    llmModel: args.llmModel,
    llmRoute: args.llmRoute,
    principalId: args.principalId,
    runId: args.runId,
    sessionId: args.sessionId,
    startedAt: Date.now(),
    status: "queued",
    userId: args.userId,
    zapSlug: args.zapSlug,
    zapVersion: args.zapVersion,
  };
  memoryRuns.set(args.runId, run);
  await mutate(createRun, args);
}

export async function updateRunLedger(args: {
  costUsd?: number;
  error?: string;
  runId: string;
  stage?: string;
  status: RunStatus;
  zapUrl?: string;
}) {
  const current = memoryRuns.get(args.runId);
  if (current) {
    memoryRuns.set(args.runId, {
      ...current,
      costUsd: args.costUsd ?? current.costUsd,
      error: args.error,
      finishedAt: isTerminalRunStatus(args.status) ? Date.now() : current.finishedAt,
      stage: args.stage,
      status: args.status,
      zapUrl: args.zapUrl,
    });
  }
  await mutate(updateRunMutation, args);
}

export async function upsertStepLedger(args: {
  actualUsd?: number;
  error?: string;
  idemKey?: string;
  kind: ZapStep["kind"] | string;
  model?: string;
  priceQuoteUsd: number;
  progress: number;
  provider?: string;
  providerRequestId?: string;
  runId: string;
  status: StepStatus;
  stepId: string;
}) {
  const key = stepKey(args.runId, args.stepId);
  memorySteps.set(key, { ...memorySteps.get(key), ...args });
  await mutate(upsertStepMutation, args);
}

export async function addAssetLedger(args: {
  durationS?: number;
  height?: number;
  kind: AssetKind;
  parents: string[];
  runId: string;
  stepId: string;
  storageKey?: string;
  url: string;
  width?: number;
}) {
  const existing = Array.from(memoryAssets.values()).find((asset) =>
    asset.runId === args.runId && asset.stepId === args.stepId && asset.url === args.url
  );
  if (existing?._id) return existing._id;

  const assetId = `mem_ast_${memoryAssets.size + 1}`;
  const convexAssetId = await mutate(addAssetMutation, args) as string | undefined;
  const id = convexAssetId ?? assetId;
  memoryAssets.set(id, { _id: id, ...args });
  return id;
}

/** Delete the private Air artifact from durable and process-local ledgers. */
export async function redactAirVideoAsset(args: { runId: string; storageKey: string }) {
  for (const [id, asset] of memoryAssets) {
    if (asset.runId === args.runId && asset.storageKey === args.storageKey) {
      memoryAssets.delete(id);
    }
  }
  const current = memoryRuns.get(args.runId);
  if (current?.zapSlug === "air-imessage-video") {
    memoryRuns.set(args.runId, {
      ...current,
      error: "VIDEO_EXPIRED",
      status: "failed",
      zapUrl: undefined,
    });
  }
  await mutate(redactAirVideoAssetMutation, args);
}

export async function addFeedbackLedger(args: {
  assetId?: string;
  comment?: string;
  kind: LedgerFeedback["kind"];
  rater: LedgerFeedback["rater"];
  runId: string;
  scores: unknown;
  stepId?: string;
}) {
  const feedbackId = `mem_feedback_${memoryFeedback.size + 1}`;
  const feedback: LedgerFeedback = {
    _id: feedbackId,
    createdAt: Date.now(),
    ...args,
  };
  const convexFeedback = { createdAt: feedback.createdAt, ...args };
  const convexFeedbackId = await mutate(addFeedbackMutation, convexFeedback) as string | undefined;
  const id = convexFeedbackId ?? feedbackId;
  memoryFeedback.set(id, { ...feedback, _id: id });
  return id;
}

export async function getRunSnapshot(runId: string, budgetCapUsd?: number): Promise<RunSnapshot> {
  const client = getConvexClient();
  if (client) {
    try {
      const data = await client.query(getRunQuery, { runId, serviceToken: convexServiceToken() }) as {
        assets: LedgerAsset[];
        feedback?: LedgerFeedback[];
        run: LedgerRun | null;
        steps: LedgerStep[];
      };
      return withRemainingBudget({ ...data, feedback: data.feedback ?? [], statusUrl: `/runs/${runId}` }, budgetCapUsd);
    } catch (error) {
      if (isProductionLedger()) throw error;
      // Fall back to process-local state so local plan/live test runs remain observable.
    }
  } else if (isProductionLedger()) {
    throw new Error("CONVEX_URL is required for the production run ledger.");
  }
  const run = memoryRuns.get(runId) ?? null;
  const steps = Array.from(memorySteps.values()).filter((step) => step.runId === runId);
  const assets = Array.from(memoryAssets.values()).filter((asset) => asset.runId === runId);
  const feedback = Array.from(memoryFeedback.values()).filter((entry) => entry.runId === runId);
  return withRemainingBudget({ assets, feedback, run, statusUrl: `/runs/${runId}`, steps }, budgetCapUsd);
}

export async function getAssetSnapshot(assetId: string): Promise<LedgerAsset | null> {
  const memoryAsset = memoryAssets.get(assetId);
  if (memoryAsset) return memoryAsset;

  const client = getConvexClient();
  if (client) {
    try {
      return await client.query(getAssetQuery, { assetId, serviceToken: convexServiceToken() }) as LedgerAsset | null;
    } catch (error) {
      if (isProductionLedger()) throw error;
      return null;
    }
  } else if (isProductionLedger()) {
    throw new Error("CONVEX_URL is required for the production run ledger.");
  }
  return null;
}

function withRemainingBudget(snapshot: Omit<RunSnapshot, "remainingBudgetUsd">, budgetCapUsd?: number): RunSnapshot {
  return {
    ...snapshot,
    remainingBudgetUsd: budgetCapUsd === undefined || !snapshot.run
      ? undefined
      : Math.max(0, budgetCapUsd - snapshot.run.costUsd),
  };
}

function getConvexClient() {
  if (convexClient !== undefined) return convexClient;
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  convexClient = url ? new ConvexHttpClient(url) : null;
  return convexClient;
}

async function mutate(ref: ReturnType<typeof makeFunctionReference<"mutation">>, args: Record<string, unknown>) {
  const client = getConvexClient();
  if (!client) {
    if (isProductionLedger()) throw new Error("CONVEX_URL is required for the production run ledger.");
    return undefined;
  }
  try {
    return await client.mutation(ref, { ...args, serviceToken: convexServiceToken() });
  } catch (error) {
    if (isProductionLedger()) throw error;
    // The in-memory ledger keeps the run observable locally; deployment logs
    // still show Convex failures for operators through the thrown call site.
    return undefined;
  }
}

function isProductionLedger() {
  return process.env.NODE_ENV === "production";
}

function stepKey(runId: string, stepId: string) {
  return `${runId}:${stepId}`;
}

function isTerminalRunStatus(status: RunStatus) {
  return status === "done" || status === "failed" || status === "canceled";
}
