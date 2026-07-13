import { describe, expect, it } from "vitest";
import {
  encodeStudioRunsEvent,
  nextStudioRunStreamFailureCount,
  parseStudioRunsPayload,
  projectStudioRunRows,
  shouldFallbackFromStudioRunStream,
  STUDIO_RUN_STREAM_FAILURE_LIMIT,
} from "../lib/studio-runs";

const privateRow = {
  assets: [{ _id: "asset-1", kind: "mp4", stepId: "render", storageKey: "private/key", url: "https://private.test/video" }],
  feedback: [{ kind: "judge_score", rater: "private-rater", scores: { overall: 0.91, passed: true }, stepId: "render" }],
  run: {
    costUsd: 0.25,
    inputs: { PRIVATE_PROMPT: "secret" },
    principalId: "wallet:0x123",
    runId: "run-1",
    stage: "rendering",
    status: "running",
    zapSlug: "world-cup-entrance",
  },
  steps: [{ progress: 0.5, providerRequestId: "provider-secret", status: "running", stepId: "render" }],
};

describe("Studio run stream projection", () => {
  it("whitelists only rail-safe Convex fields", () => {
    const projected = projectStudioRunRows([privateRow]);

    expect(projected).toEqual([{
      assets: [{ _id: "asset-1", kind: "mp4", stepId: "render" }],
      feedback: [{ kind: "judge_score", scores: { overall: 0.91, passed: true }, stepId: "render" }],
      run: {
        costUsd: 0.25,
        runId: "run-1",
        stage: "rendering",
        status: "running",
        zapSlug: "world-cup-entrance",
      },
      steps: [{ progress: 0.5, status: "running", stepId: "render" }],
    }]);
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATE_PROMPT|private-rater|private\/key|provider-secret|principalId/);
  });

  it("encodes a named SSE event and parses the same projected payload", () => {
    const encoded = encodeStudioRunsEvent([privateRow]);
    expect(encoded).toMatch(/^event: runs\ndata: /);
    expect(encoded.endsWith("\n\n")).toBe(true);

    const payload = JSON.parse(encoded.split("\ndata: ")[1]!.trim());
    expect(parseStudioRunsPayload(payload)).toEqual(projectStudioRunRows([privateRow]));
  });

  it("drops malformed rows instead of exposing untrusted payloads", () => {
    expect(parseStudioRunsPayload({ runs: [{ run: { inputs: { secret: true } } }] })).toEqual([]);
    expect(parseStudioRunsPayload("not an object")).toEqual([]);
  });

  it("allows a bounded stream to reconnect before falling back to polling", () => {
    expect(shouldFallbackFromStudioRunStream(false, 1)).toBe(false);
    expect(shouldFallbackFromStudioRunStream(false, STUDIO_RUN_STREAM_FAILURE_LIMIT)).toBe(true);
    expect(shouldFallbackFromStudioRunStream(true, 1)).toBe(true);
  });

  it("counts repeated open-then-error cycles until a runs event proves the stream healthy", () => {
    let failures = 0;
    for (let attempt = 1; attempt <= STUDIO_RUN_STREAM_FAILURE_LIMIT; attempt += 1) {
      failures = nextStudioRunStreamFailureCount(failures, "open");
      failures = nextStudioRunStreamFailureCount(failures, "error");
      expect(shouldFallbackFromStudioRunStream(false, failures)).toBe(
        attempt === STUDIO_RUN_STREAM_FAILURE_LIMIT,
      );
    }
    expect(nextStudioRunStreamFailureCount(failures, "runs")).toBe(0);
  });
});
