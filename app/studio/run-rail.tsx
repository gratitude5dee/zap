"use client";

import { useEffect, useState } from "react";
import {
  nextStudioRunStreamFailureCount,
  parseStudioRunsPayload,
  shouldFallbackFromStudioRunStream,
  type StudioRailRun,
} from "@/lib/studio-runs";

export function RunRail() {
  return <RunRailQuery />;
}

function RunRailQuery() {
  const [runs, setRuns] = useState<StudioRailRun[] | undefined>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let eventSource: EventSource | undefined;
    let fallbackTimer: number | undefined;
    let consecutiveStreamFailures = 0;

    async function refresh() {
      try {
        const response = await fetch("/api/studio/runs", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setError(payload.error ?? "Run ledger is unavailable.");
          return;
        }
        setError(undefined);
        setRuns(parseStudioRunsPayload(payload));
      } catch {
        if (active) setError("Run ledger is unavailable.");
      }
    }

    function startFallback() {
      if (!active || fallbackTimer !== undefined) return;
      eventSource?.close();
      void refresh();
      fallbackTimer = window.setInterval(() => void refresh(), 3_000);
    }

    if (typeof window.EventSource === "undefined") {
      startFallback();
    } else {
      eventSource = new window.EventSource("/api/studio/runs/stream");
      eventSource.addEventListener("runs", (event) => {
        if (!active || !(event instanceof MessageEvent)) return;
        try {
          setRuns(parseStudioRunsPayload(JSON.parse(event.data)));
          consecutiveStreamFailures = nextStudioRunStreamFailureCount(consecutiveStreamFailures, "runs");
          setError(undefined);
        } catch {
          startFallback();
        }
      });
      eventSource.addEventListener("stream-error", () => startFallback());
      eventSource.onopen = () => {
        consecutiveStreamFailures = nextStudioRunStreamFailureCount(consecutiveStreamFailures, "open");
      };
      eventSource.onerror = () => {
        consecutiveStreamFailures = nextStudioRunStreamFailureCount(consecutiveStreamFailures, "error");
        const permanentlyClosed = eventSource?.readyState === window.EventSource.CLOSED;
        // One transient error is expected when the bounded server stream rolls
        // over. EventSource reconnects natively; repeated failures use polling.
        if (shouldFallbackFromStudioRunStream(permanentlyClosed, consecutiveStreamFailures)) startFallback();
      };
    }

    return () => {
      active = false;
      eventSource?.close();
      if (fallbackTimer !== undefined) window.clearInterval(fallbackTimer);
    };
  }, []);

  return (
    <aside className="zap-run-rail overflow-y-auto border-white/10 border-l bg-black/35 p-4 text-white">
      <RailHeader />
      {error ? <div className="mt-4 rounded-md border border-red-400/20 bg-red-400/10 p-3 text-red-100 text-sm">{error}</div> : null}
      {runs === undefined ? <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm text-white/50">Loading run ledger...</div> : null}
      {runs?.length === 0 ? <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-3 text-sm text-white/50">No runs yet.</div> : null}
      <div className="mt-4 space-y-3">
        {runs?.map((entry) => <RunCard entry={entry} key={entry.run.runId} />)}
      </div>
    </aside>
  );
}

function RailHeader() {
  return (
    <div>
      <h2 className="font-semibold text-sm">Mission Control</h2>
      <p className="mt-1 text-white/45 text-xs">Live runs, cost, assets, and judge signals.</p>
    </div>
  );
}

function RunCard({ entry }: { readonly entry: StudioRailRun }) {
  const doneSteps = entry.steps.filter((step) => step.status === "done").length;
  const progress = entry.steps.length ? doneSteps / entry.steps.length : 0;
  const latestJudge = entry.feedback.findLast((feedback) => feedback.kind === "judge_score");
  const score = latestJudge?.scores?.overall;

  return (
    <a className="block rounded-md border border-white/10 bg-white/[0.045] p-3 transition hover:border-zap-cyan/40" href={`/runs/${entry.run.runId}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-medium text-sm text-white">{entry.run.zapSlug}</span>
        <b className="rounded border border-white/10 px-2 py-1 font-medium text-[11px] text-zap-cyan">{entry.run.status}</b>
      </div>
      <p className="mt-2 truncate text-white/45 text-xs">{entry.run.stage ?? "pending"}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded bg-white/10" aria-label={`${Math.round(progress * 100)} percent complete`}>
        <span className="block h-full rounded bg-zap-cyan" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
        <span>${entry.run.costUsd.toFixed(2)}</span>
        <span>{entry.assets.length} assets</span>
        <span>{score === undefined ? "no judge" : `judge ${score.toFixed(2)}`}</span>
      </div>
    </a>
  );
}
