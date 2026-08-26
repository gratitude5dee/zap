// @ts-check
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";
import { lintSpec, parseZapFile, resolveZapFile, validateSpec } from "../../lib/recipe.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "improve",
  summary: "Propose a version bump from run and feedback evidence",
  usage: "zap improve <slug|Zap.md> [--json] [--write]",
  async run({ args, flags }) {
    const requested = args[0];
    if (!requested) throw new Error("Usage: zap improve <slug|Zap.md> [--json] [--write]");
    const file = resolveZapFile(requested);
    const spec = await parseZapFile(file);
    validateSpec(spec);
    const evidence = await readImproveEvidenceForZap(spec.zap);
    const { feedback, runs } = evidence;
    const warnings = lintSpec(spec);
    const failedRuns = runs.filter((run) => run.status === "failed" || run.status === "canceled");
    const doneRuns = runs.filter((run) => run.status === "done");
    const stepFailures = summarizeStepFailures(runs);
    const recommendations = buildImproveRecommendations({ failedRuns, feedback, spec, stepFailures, warnings });
    const proposal = {
      currentVersion: spec.version,
      evidence: {
        doneRuns: doneRuns.length,
        failedRuns: failedRuns.length,
        feedbackCount: feedback.length,
        sources: evidence.sources,
        latestRunId: runs.at(-1)?.runId,
        lintWarnings: warnings,
        stepFailures,
      },
      file,
      proposedVersion: Number(spec.version ?? 0) + 1,
      recommendations,
      slug: spec.zap,
      summary: recommendations.length === 0
        ? "No strong improvement signal found yet. Collect more runs, judge scores, or creator feedback before bumping the recipe."
        : `Propose v${Number(spec.version ?? 0) + 1} with ${recommendations.length} improvement(s) grounded in run/feedback evidence.`,
    };

    if (flags.write) {
      const dir = path.join(process.cwd(), ".zap", "improvements");
      await fs.mkdir(dir, { recursive: true });
      const target = path.join(dir, `${spec.zap}-v${proposal.proposedVersion}.md`);
      await fs.writeFile(target, renderImproveProposal(proposal, feedback));
      proposal.path = target;
    }

    if (flags.json) printJson(proposal);
    else {
      console.log(`${proposal.slug}: ${proposal.summary}`);
      proposal.recommendations.forEach((item, index) => console.log(`${index + 1}. ${item}`));
      if (proposal.path) console.log(`Wrote ${proposal.path}`);
    }
  },
};

async function readLocalRunsForZap(slug) {
  const runsDir = path.join(process.cwd(), ".zap", "runs");
  if (!existsSync(runsDir)) return [];
  const entries = await fs.readdir(runsDir);
  const runs = [];
  for (const entry of entries) {
    const file = path.join(runsDir, entry, "result.json");
    if (!existsSync(file)) continue;
    try {
      const run = JSON.parse(await fs.readFile(file, "utf8"));
      if (run.zap === slug || run.zapSlug === slug) runs.push(run);
    } catch {
      // Ignore malformed local traces; improve should use available evidence.
    }
  }
  return runs.sort((left, right) => String(left.runId).localeCompare(String(right.runId)));
}

async function readImproveEvidenceForZap(slug) {
  const localRuns = await readLocalRunsForZap(slug);
  const localFeedback = await readLocalFeedback();
  const convexEvidence = await readConvexEvidenceForZap(slug);
  return {
    feedback: mergeFeedback([...localFeedback, ...convexEvidence.feedback]),
    runs: mergeRuns([...localRuns, ...convexEvidence.runs]),
    sources: {
      convexAvailable: convexEvidence.available,
      convexError: convexEvidence.error,
      convexRuns: convexEvidence.runs.length,
      localFeedback: localFeedback.length,
      localRuns: localRuns.length,
    },
  };
}

async function readConvexEvidenceForZap(slug) {
  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return { available: false, feedback: [], runs: [] };
  try {
    const [{ ConvexHttpClient }, { makeFunctionReference }] = await Promise.all([
      import("convex/browser"),
      import("convex/server"),
    ]);
    const client = new ConvexHttpClient(convexUrl);
    const listByZap = makeFunctionReference("runs:listByZap");
    const snapshots = await client.query(listByZap, { limit: 50, zapSlug: slug });
    const normalizedRuns = [];
    const feedback = [];
    for (const snapshot of snapshots ?? []) {
      if (!snapshot?.run) continue;
      normalizedRuns.push(normalizeConvexRun(snapshot));
      feedback.push(...(snapshot.feedback ?? []).map((entry) => ({ ...entry, source: "convex" })));
    }
    return { available: true, feedback, runs: normalizedRuns };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      feedback: [],
      runs: [],
    };
  }
}

function normalizeConvexRun(snapshot) {
  const run = snapshot.run;
  return {
    ...run,
    source: "convex",
    steps: (snapshot.steps ?? []).map((step) => ({
      ...step,
      quoteUsd: step.quoteUsd ?? step.priceQuoteUsd ?? 0,
      stepId: step.stepId ?? step.id,
    })),
  };
}

function mergeRuns(runs) {
  const byRunId = new Map();
  for (const run of runs) {
    if (!run?.runId) continue;
    const existing = byRunId.get(run.runId);
    if (!existing || run.source === "convex") byRunId.set(run.runId, run);
  }
  return Array.from(byRunId.values()).sort((left, right) =>
    Number(left.startedAt ?? 0) - Number(right.startedAt ?? 0) || String(left.runId).localeCompare(String(right.runId)),
  );
}

function mergeFeedback(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = entry?._id ?? `${entry?.runId ?? "local"}:${entry?.stepId ?? "run"}:${entry?.createdAt ?? ""}:${entry?.message ?? entry?.comment ?? ""}`;
    byKey.set(key, entry);
  }
  return Array.from(byKey.values()).sort((left, right) =>
    Number(left.createdAt ?? 0) - Number(right.createdAt ?? 0),
  );
}

async function readLocalFeedback() {
  const file = path.join(process.cwd(), ".zap", "feedback.ndjson");
  if (!existsSync(file)) return [];
  const content = await fs.readFile(file, "utf8");
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

function summarizeStepFailures(runs) {
  const failures = {};
  for (const run of runs) {
    for (const step of run.steps ?? []) {
      if (step.status !== "failed" && !step.error) continue;
      const key = step.stepId ?? step.id ?? step.kind ?? "unknown";
      failures[key] = (failures[key] ?? 0) + 1;
    }
  }
  return failures;
}

function buildImproveRecommendations({ failedRuns, feedback, spec, stepFailures, warnings }) {
  const recommendations = [];
  if (warnings.some((warning) => warning.includes("defaults.provider is live"))) {
    recommendations.push("Document why this recipe intentionally defaults to a specific live provider, or switch defaults.provider to the cheapest supported provider.");
  }
  if (failedRuns.length > 0 || Object.keys(stepFailures).length > 0) {
    recommendations.push("Add or tune per-step retry policies for failing provider steps, including fallback_provider/fallback_model where support exists.");
  }
  if (feedback.length > 0) {
    recommendations.push("Review local creator feedback and convert repeated comments into prompt, input, or judge-criteria changes before bumping the version.");
  }
  if (!spec.steps.some((step) => step.judge)) {
    recommendations.push("Add judge criteria to final video/image steps so future improvements can use scores instead of prose-only feedback.");
  }
  if (!spec.steps.some((step) => step.kind === "stitch")) {
    recommendations.push("Add a final stitch step so the recipe has a single replayable Zap output.");
  }
  return recommendations;
}

function renderImproveProposal(proposal, feedback) {
  const lines = [
    `# Improve ${proposal.slug} to v${proposal.proposedVersion}`,
    "",
    proposal.summary,
    "",
    "## Evidence",
    "",
    `- Done runs: ${proposal.evidence.doneRuns}`,
    `- Failed runs: ${proposal.evidence.failedRuns}`,
    `- Feedback entries: ${proposal.evidence.feedbackCount}`,
    `- Latest run: ${proposal.evidence.latestRunId ?? "none"}`,
    `- Sources: ${proposal.evidence.sources.convexRuns} Convex run(s), ${proposal.evidence.sources.localRuns} local run(s), ${proposal.evidence.sources.localFeedback} local feedback item(s)`,
    "",
    "## Recommendations",
    "",
    ...(proposal.recommendations.length ? proposal.recommendations.map((item) => `- ${item}`) : ["- Collect more run and feedback evidence before editing the recipe."]),
  ];
  if (feedback.length > 0) {
    lines.push("", "## Feedback Samples", "");
    for (const entry of feedback.slice(-5)) {
      lines.push(`- ${entry.createdAt ?? "unknown"}: ${entry.message ?? JSON.stringify(entry)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
