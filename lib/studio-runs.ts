export type StudioRailRun = {
  assets: Array<{ _id?: string; kind: string; stepId: string }>;
  feedback: Array<{
    kind: string;
    scores?: { overall?: number; passed?: boolean; vote?: string };
    stepId?: string;
  }>;
  run: {
    costUsd: number;
    runId: string;
    stage?: string;
    status: string;
    zapSlug: string;
    zapUrl?: string;
  };
  steps: Array<{ progress: number; status: string; stepId: string }>;
};

export const STUDIO_RUN_STREAM_FAILURE_LIMIT = 3;
export const STUDIO_RUN_STREAM_LIFETIME_MS = 4 * 60 * 1000;

export type StudioRunStreamSignal = "open" | "runs" | "error";

export function nextStudioRunStreamFailureCount(current: number, signal: StudioRunStreamSignal): number {
  if (signal === "runs") return 0;
  if (signal === "error") return current + 1;
  return current;
}

export function shouldFallbackFromStudioRunStream(permanentlyClosed: boolean, consecutiveFailures: number): boolean {
  return permanentlyClosed || consecutiveFailures >= STUDIO_RUN_STREAM_FAILURE_LIMIT;
}

export function projectStudioRunRows(rows: readonly unknown[]): StudioRailRun[] {
  return rows.flatMap((row) => {
    if (!isRecord(row) || !isRecord(row.run)) return [];
    const runId = readString(row.run.runId);
    const zapSlug = readString(row.run.zapSlug);
    if (!runId || !zapSlug) return [];

    return [{
      assets: readArray(row.assets).flatMap((asset) => {
        if (!isRecord(asset)) return [];
        const kind = readString(asset.kind);
        const stepId = readString(asset.stepId);
        if (!kind || !stepId) return [];
        const id = readString(asset._id);
        return [{ ...(id ? { _id: id } : {}), kind, stepId }];
      }),
      feedback: readArray(row.feedback).flatMap((feedback) => {
        if (!isRecord(feedback)) return [];
        const kind = readString(feedback.kind);
        if (!kind) return [];
        const scores = projectScores(feedback.scores);
        const stepId = readString(feedback.stepId);
        return [{
          kind,
          ...(scores ? { scores } : {}),
          ...(stepId ? { stepId } : {}),
        }];
      }),
      run: {
        costUsd: readFiniteNumber(row.run.costUsd) ?? 0,
        runId,
        ...(readString(row.run.stage) ? { stage: readString(row.run.stage) } : {}),
        status: readString(row.run.status) ?? "queued",
        zapSlug,
        ...(readString(row.run.zapUrl) ? { zapUrl: readString(row.run.zapUrl) } : {}),
      },
      steps: readArray(row.steps).flatMap((step) => {
        if (!isRecord(step)) return [];
        const status = readString(step.status);
        const stepId = readString(step.stepId);
        if (!status || !stepId) return [];
        return [{ progress: readFiniteNumber(step.progress) ?? 0, status, stepId }];
      }),
    }];
  });
}

export function parseStudioRunsPayload(payload: unknown): StudioRailRun[] {
  if (!isRecord(payload)) return [];
  return projectStudioRunRows(readArray(payload.runs));
}

export function encodeStudioRunsEvent(rows: readonly unknown[]): string {
  return `event: runs\ndata: ${JSON.stringify({ runs: projectStudioRunRows(rows) })}\n\n`;
}

function projectScores(value: unknown) {
  if (!isRecord(value)) return undefined;
  const overall = readFiniteNumber(value.overall);
  const passed = typeof value.passed === "boolean" ? value.passed : undefined;
  const vote = readString(value.vote);
  if (overall === undefined && passed === undefined && vote === undefined) return undefined;
  return {
    ...(overall === undefined ? {} : { overall }),
    ...(passed === undefined ? {} : { passed }),
    ...(vote === undefined ? {} : { vote }),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
