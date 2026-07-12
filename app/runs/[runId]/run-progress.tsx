"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";

const getRun = makeFunctionReference<"query">("runs:getPublic");

type RunView = {
  assets: Array<{ _id?: string; kind: string; parents?: string[]; stepId: string; url: string }>;
  feedback: Array<{
    _id?: string;
    assetId?: string;
    comment?: string;
    createdAt?: number;
    kind: string;
    scores: { overall?: number; passed?: boolean; threshold?: number; vote?: string } | Record<string, unknown>;
    stepId?: string;
  }>;
  run: {
    costUsd: number;
    error?: string;
    runId: string;
    stage?: string;
    status: string;
    zapUrl?: string;
  } | null;
  steps: Array<{
    actualUsd?: number;
    error?: string;
    kind: string;
    model?: string;
    priceQuoteUsd?: number;
    progress: number;
    provider?: string;
    status: string;
    stepId: string;
  }>;
};

export function RunProgress({ runId, fallbackStatus }: { readonly fallbackStatus?: string; readonly runId: string }) {
  const data = useQuery(getRun, { runId }) as RunView | undefined;
  const [rerunBusyStep, setRerunBusyStep] = useState<string | null>(null);
  const [rerunMessage, setRerunMessage] = useState<string | null>(null);
  if (data === undefined) {
    return <p className="mt-4 text-sm text-white/50">Loading run state from Convex...</p>;
  }
  if (!data?.run) {
    return <p className="mt-4 text-sm text-white/50">Run queued locally: {fallbackStatus ?? "unknown"}</p>;
  }
  const waitingStep = data.steps.find((step) => step.status === "waiting");
  const canRerun = data.run.status !== "running" && data.run.status !== "queued";
  const rerunnableStepIds = new Set(data.steps.map((step) => step.stepId));

  async function submitRerunFrom(stepId: string) {
    setRerunBusyStep(stepId);
    setRerunMessage(null);
    const response = await fetch(`/api/runs/${runId}/rerun-from`, {
      body: JSON.stringify({
        comment: `Human requested re-run from ${stepId}.`,
        stepId,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setRerunMessage(formatRunError(JSON.stringify(payload.error ?? payload)));
      setRerunBusyStep(null);
      return;
    }
    setRerunMessage(`Re-running from ${stepId}...`);
    setRerunBusyStep(null);
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-md border border-[#00e5ff]/30 bg-[#00e5ff]/10 px-2 py-1 text-[#00e5ff]">{data.run.status}</span>
        <span className="text-white/55">Stage: {data.run.stage ?? "pending"}</span>
        <span className="text-white/55">Cost: ${data.run.costUsd.toFixed(2)}</span>
      </div>
      {data.run.error ? <p className="rounded-md border border-red-400/25 bg-red-400/10 px-3 py-2 text-red-100 text-sm">{formatRunError(data.run.error)}</p> : null}
      {data.run.status === "waiting" && waitingStep ? (
        <ReviewActions runId={runId} stepId={waitingStep.stepId} />
      ) : null}
      {data.run.zapUrl ? (
        <a className="inline-flex text-sm text-zap-cyan underline-offset-2 hover:underline" href={data.run.zapUrl} rel="noreferrer" target="_blank">
          Open output
        </a>
      ) : null}
      <div className="space-y-3">
        {data.steps.map((step) => (
          <div className="rounded-md border border-white/10 bg-white/[0.04] p-3" key={step.stepId}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-white">{step.stepId}</span>
              <span className="text-white/50">{step.status}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-md bg-white/10">
              <div className="h-full bg-[#00e5ff] transition-all" style={{ width: `${Math.round((step.progress ?? 0) * 100)}%` }} />
            </div>
            <p className="mt-2 text-white/45 text-xs">
              {step.provider ?? "local"} / {step.model ?? step.kind}
              {step.priceQuoteUsd !== undefined ? ` · quote $${step.priceQuoteUsd.toFixed(2)}` : ""}
              {step.actualUsd !== undefined ? ` · actual $${step.actualUsd.toFixed(2)}` : ""}
            </p>
            {step.error ? <p className="mt-2 text-red-100 text-xs">{formatRunError(step.error)}</p> : null}
          </div>
        ))}
      </div>
      {data.assets.length > 0 ? (
        <section className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium text-sm text-white">Assets</h2>
            {rerunMessage ? <p className="text-xs text-white/55">{rerunMessage}</p> : null}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {data.assets.map((asset) => (
              <div className="rounded-md border border-white/10 bg-black/20 p-3 text-xs" key={asset._id ?? `${asset.stepId}:${asset.url}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">{asset.stepId}</span>
                  <span className="rounded border border-white/10 px-2 py-1 text-white/50">{asset.kind}</span>
                </div>
                <p className="mt-2 break-all text-white/45">Handle: {asset._id ?? "local"}</p>
                <p className="mt-1 text-white/45">Parents: {asset.parents?.length ? asset.parents.join(", ") : "none"}</p>
                <a className="mt-2 inline-flex text-zap-cyan underline-offset-2 hover:underline" href={asset.url} rel="noreferrer" target="_blank">
                  Open asset
                </a>
                {rerunnableStepIds.has(asset.stepId) ? (
                  <button
                    className="ml-3 mt-2 inline-flex rounded-md border border-white/15 bg-white/10 px-2 py-1 font-medium text-white disabled:opacity-50"
                    disabled={!canRerun || rerunBusyStep !== null}
                    onClick={() => submitRerunFrom(asset.stepId)}
                    type="button"
                  >
                    {rerunBusyStep === asset.stepId ? "Re-running" : "Re-run from here"}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {data.feedback.length > 0 ? (
        <section className="rounded-md border border-white/10 bg-white/[0.04] p-3">
          <h2 className="font-medium text-sm text-white">Feedback</h2>
          <div className="mt-3 space-y-2">
            {data.feedback.map((entry) => (
              <FeedbackRow entry={entry} key={entry._id ?? `${entry.kind}:${entry.stepId}:${entry.createdAt}`} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReviewActions({ runId, stepId }: { readonly runId: string; readonly stepId: string }) {
  const [busy, setBusy] = useState<"approve" | "retry" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(action: "approve" | "retry") {
    setBusy(action);
    setMessage(null);
    const response = await fetch(`/api/runs/${runId}/${action}`, {
      body: JSON.stringify({
        comment: action === "approve"
          ? `Human approved ${stepId} after judge review.`
          : `Human requested regeneration for ${stepId}.`,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(formatRunError(JSON.stringify(payload.error ?? payload)));
      setBusy(null);
      return;
    }
    setMessage(action === "approve" ? "Approved. Resuming from the next step..." : "Regenerating this step...");
    setBusy(null);
  }

  return (
    <div className="rounded-md border border-amber-300/25 bg-amber-300/10 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-amber-100">Human review needed</p>
          <p className="mt-1 text-amber-100/65 text-xs">Step {stepId} is waiting on the judge gate.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-md bg-zap-cyan px-3 py-2 font-medium text-black text-xs disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => submit("approve")}
            type="button"
          >
            {busy === "approve" ? "Approving" : "Approve"}
          </button>
          <button
            className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-white text-xs disabled:opacity-50"
            disabled={busy !== null}
            onClick={() => submit("retry")}
            type="button"
          >
            {busy === "retry" ? "Submitting" : "Regenerate"}
          </button>
        </div>
      </div>
      {message ? <p className="mt-2 text-amber-100/75 text-xs">{message}</p> : null}
    </div>
  );
}

function FeedbackRow({ entry }: { readonly entry: RunView["feedback"][number] }) {
  const scores = entry.scores as { overall?: number; passed?: boolean; threshold?: number; vote?: string };
  const status = entry.kind === "judge_score"
    ? `${scores.passed ? "passed" : "failed"} ${formatScore(scores.overall)} / ${formatScore(scores.threshold)}`
    : scores.vote ?? "recorded";
  return (
    <div className="rounded-md border border-white/10 bg-black/20 p-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-white">{entry.stepId ?? "run"}</span>
        <span className="rounded border border-white/10 px-2 py-1 text-white/50">{entry.kind}</span>
      </div>
      <p className="mt-2 text-white/65">{status}</p>
      {entry.assetId ? <p className="mt-1 break-all text-white/45">Asset: {entry.assetId}</p> : null}
      {entry.comment ? <p className="mt-1 text-white/45">{entry.comment}</p> : null}
    </div>
  );
}

function formatScore(score?: number) {
  return typeof score === "number" ? score.toFixed(2) : "n/a";
}

function formatRunError(error: string) {
  try {
    const parsed = JSON.parse(error) as { message?: string; remediation?: string };
    return [parsed.message, parsed.remediation].filter(Boolean).join(" ");
  } catch {
    return error;
  }
}
