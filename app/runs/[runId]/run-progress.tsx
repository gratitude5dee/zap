"use client";

import { useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";

const getRun = makeFunctionReference<"query">("runs:get");

type RunView = {
  assets: Array<{ kind: string; stepId: string; url: string }>;
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
    progress: number;
    provider?: string;
    status: string;
    stepId: string;
  }>;
};

export function RunProgress({ runId, fallbackStatus }: { readonly fallbackStatus?: string; readonly runId: string }) {
  const data = useQuery(getRun, { runId }) as RunView | undefined;
  if (data === undefined) {
    return <p className="mt-4 text-sm text-zinc-500">Loading run state from Convex...</p>;
  }
  if (!data?.run) {
    return <p className="mt-4 text-sm text-zinc-500">Run queued locally: {fallbackStatus ?? "unknown"}</p>;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-md bg-zinc-950 px-2 py-1 text-white">{data.run.status}</span>
        <span className="text-zinc-600">Stage: {data.run.stage ?? "pending"}</span>
        <span className="text-zinc-600">Cost: ${data.run.costUsd.toFixed(2)}</span>
      </div>
      {data.run.error ? <p className="rounded-md bg-red-50 px-3 py-2 text-red-700 text-sm">{data.run.error}</p> : null}
      <div className="space-y-3">
        {data.steps.map((step) => (
          <div className="rounded-md border bg-zinc-50 p-3" key={step.stepId}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{step.stepId}</span>
              <span className="text-zinc-500">{step.status}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((step.progress ?? 0) * 100)}%` }} />
            </div>
            <p className="mt-2 text-zinc-500 text-xs">
              {step.provider ?? "local"} / {step.model ?? step.kind}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
