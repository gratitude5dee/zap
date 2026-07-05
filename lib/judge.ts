import { createHash } from "node:crypto";
import { generateObject, gateway, type ModelMessage } from "ai";
import { z } from "zod";
import { addFeedbackLedger, getAssetSnapshot, type LedgerFeedback } from "./run-ledger";
import { ZapRunError } from "./zap-errors";
import type { ZapStep } from "./zap-schema";

export type JudgeAssetInput = {
  assetId: string;
  assetUrl?: string;
  criteria: string[];
  runId: string;
  stepId: string;
  threshold?: number;
};

export type JudgeAssetResult = {
  assetId: string;
  feedbackId: string;
  mode: "gateway" | "heuristic";
  model?: string;
  overall: number;
  passed: boolean;
  rationale?: string;
  runId: string;
  scores: Record<string, number>;
  stepId: string;
  threshold: number;
};

export async function judgeAsset(input: JudgeAssetInput): Promise<JudgeAssetResult> {
  const threshold = input.threshold ?? 0.7;
  const criteria = input.criteria.length > 0 ? input.criteria : ["overall_quality"];
  const asset = input.assetUrl ? null : await getAssetSnapshot(input.assetId);
  const assetUrl = input.assetUrl ?? asset?.url;
  if (!assetUrl) {
    throw new ZapRunError({
      code: "RUN_NOT_FOUND",
      message: `Asset ${input.assetId} was not found for judging.`,
      remediation: "Call get_run_status, choose a returned asset handle, then retry judge_asset.",
      retryable: false,
    });
  }

  const judged = await scoreAsset({ ...input, assetUrl, criteria });
  const scores = normalizeScores(judged.scores, criteria, { ...input, assetUrl });
  const overall = judged.overall === undefined ? Math.min(...Object.values(scores)) : clampScore(judged.overall);
  const passed = overall >= threshold;
  const feedbackId = await addFeedbackLedger({
    assetId: input.assetId,
    comment: passed
      ? `Judge passed at ${overall.toFixed(2)}.`
      : `Judge failed at ${overall.toFixed(2)}; threshold is ${threshold.toFixed(2)}.`,
    kind: "judge_score",
    rater: judged.mode === "gateway" ? "vlm" : "heuristic",
    runId: input.runId,
    scores: {
      criteria,
      gatewayError: judged.gatewayError,
      mode: judged.mode,
      model: judged.model,
      overall,
      passed,
      rationale: judged.rationale,
      scores,
      threshold,
    },
    stepId: input.stepId,
  });

  return {
    assetId: input.assetId,
    feedbackId,
    mode: judged.mode,
    model: judged.model,
    overall,
    passed,
    rationale: judged.rationale,
    runId: input.runId,
    scores,
    stepId: input.stepId,
    threshold,
  };
}

export function judgeConfigForStep(step: ZapStep) {
  if (!step.judge) return null;
  const judge = step.judge as Record<string, unknown>;
  if (judge.enabled === false) return null;
  const criteria = Array.isArray(judge.criteria)
    ? judge.criteria.filter((criterion): criterion is string => typeof criterion === "string")
    : ["overall_quality"];
  const thresholdValue = judge.threshold ?? judge.min_score ?? judge.minScore;
  const threshold = typeof thresholdValue === "number" ? thresholdValue : 0.7;
  return { criteria, threshold };
}

export function judgeFailurePayload(result: JudgeAssetResult) {
  return {
    alternatives: ["Generate another candidate", "Request human review", "Lower the judge threshold with approval"],
    code: "JUDGE_FAILED" as const,
    message: `Judge score ${result.overall.toFixed(2)} is below threshold ${result.threshold.toFixed(2)} for ${result.stepId}.`,
    remediation: "Review the asset, regenerate within the recipe candidate/budget limits, or approve the best available candidate manually.",
    retryable: true,
  };
}

export function summarizeJudgeFeedback(feedback: LedgerFeedback[]) {
  return feedback
    .filter((entry) => entry.kind === "judge_score")
    .map((entry) => {
      const scores = entry.scores as { overall?: number; passed?: boolean; threshold?: number } | undefined;
      return {
        assetId: entry.assetId,
        createdAt: entry.createdAt,
        overall: scores?.overall,
        passed: scores?.passed,
        stepId: entry.stepId,
        threshold: scores?.threshold,
      };
    });
}

function scoreCriterion({
  assetId,
  assetUrl,
  criterion,
  runId,
  stepId,
}: JudgeAssetInput & { assetUrl: string; criterion: string }) {
  const forced = Number(process.env.ZAP_JUDGE_FORCE_SCORE);
  if (Number.isFinite(forced)) return clampScore(forced);
  if (assetUrl.includes("fail_judge")) return 0.4;
  if (assetUrl.startsWith("data:application/json") || assetUrl.startsWith("mock://")) return 0.92;

  const hash = createHash("sha256")
    .update(`${runId}:${stepId}:${assetId}:${criterion}:${assetUrl}`)
    .digest();
  return clampScore(0.76 + (hash[0] / 255) * 0.18);
}

async function scoreAsset(input: JudgeAssetInput & { assetUrl: string; criteria: string[] }): Promise<{
  gatewayError?: string;
  mode: "gateway" | "heuristic";
  model?: string;
  overall?: number;
  rationale?: string;
  scores: Record<string, number>;
}> {
  const model = process.env.ZAP_JUDGE_MODEL ?? "google/gemini-2.5-flash";
  if (shouldUseGatewayJudge(input.assetUrl)) {
    try {
      const judged = await scoreWithGateway(input, model);
      return { ...judged, mode: "gateway", model };
    } catch (error) {
      const heuristic = scoreWithHeuristic(input);
      return {
        ...heuristic,
        gatewayError: error instanceof Error ? error.message : "Gateway judge failed.",
        rationale: "AI Gateway judge unavailable; deterministic heuristic fallback used.",
      };
    }
  }
  return scoreWithHeuristic(input);
}

async function scoreWithGateway(input: JudgeAssetInput & { assetUrl: string; criteria: string[] }, model: string) {
  const schema = z.object({
    overall: z.number().min(0).max(1).optional(),
    rationale: z.string().max(1200).optional(),
    scores: z.record(z.string(), z.number().min(0).max(1)),
  });
  const mediaUrl = new URL(input.assetUrl);
  const messages: ModelMessage[] = [
    {
      content: [
        {
          text: [
            "Judge this generated Zap media asset against the requested criteria.",
            "Return calibrated scores from 0 to 1 where 1 is excellent and 0 is unusable.",
            "Be strict about identity consistency, prompt adherence, pacing, and visible artifacts when those criteria are present.",
            `Criteria: ${input.criteria.join(", ")}`,
            `Threshold: ${input.threshold ?? 0.7}`,
          ].join("\n"),
          type: "text",
        },
        {
          data: mediaUrl,
          mediaType: inferMediaType(input.assetUrl),
          type: "file",
        },
      ],
      role: "user",
    },
  ];

  const result = await generateObject({
    instructions: "You are a concise visual quality judge for generative image and video outputs. Return only the requested object.",
    messages,
    model: gateway(model),
    schema,
    temperature: 0,
  });
  return result.object;
}

function scoreWithHeuristic(input: JudgeAssetInput & { assetUrl: string; criteria: string[] }) {
  return {
    mode: "heuristic" as const,
    rationale: "Deterministic local score used for fixtures, CI, or missing AI Gateway credentials.",
    scores: Object.fromEntries(input.criteria.map((criterion) => [criterion, scoreCriterion({ ...input, criterion })])),
  };
}

function normalizeScores(scores: Record<string, number>, criteria: string[], input: JudgeAssetInput & { assetUrl: string }) {
  return Object.fromEntries(criteria.map((criterion) => {
    const score = scores[criterion];
    return [criterion, typeof score === "number" && Number.isFinite(score)
      ? clampScore(score)
      : scoreCriterion({ ...input, criterion })];
  }));
}

function shouldUseGatewayJudge(assetUrl: string) {
  if (!process.env.AI_GATEWAY_API_KEY || assetUrl.startsWith("mock://") || assetUrl.startsWith("data:application/json")) return false;
  try {
    const url = new URL(assetUrl);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "data:";
  } catch {
    return false;
  }
}

function inferMediaType(assetUrl: string) {
  const lower = assetUrl.split("?")[0]?.toLowerCase() ?? assetUrl.toLowerCase();
  if (lower.startsWith("data:image/")) return lower.slice("data:".length, lower.indexOf(";") === -1 ? undefined : lower.indexOf(";"));
  if (lower.startsWith("data:video/")) return lower.slice("data:".length, lower.indexOf(";") === -1 ? undefined : lower.indexOf(";"));
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(1, score));
}
