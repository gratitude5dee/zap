import { afterEach, describe, expect, it } from "vitest";
import { publicRunSnapshot } from "../convex/lib/publicRun";
import { requireServiceToken } from "../convex/lib/serviceAuth";
import { convexServiceToken } from "../lib/convex-service";

const originalToken = process.env.ZAP_CONVEX_SERVICE_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.ZAP_CONVEX_SERVICE_TOKEN;
  else process.env.ZAP_CONVEX_SERVICE_TOKEN = originalToken;
});

describe("Convex service boundary", () => {
  it("fails closed when the server token is absent or wrong", () => {
    delete process.env.ZAP_CONVEX_SERVICE_TOKEN;
    expect(() => convexServiceToken()).toThrow(/required/i);
    process.env.ZAP_CONVEX_SERVICE_TOKEN = "expected";
    expect(() => requireServiceToken("wrong")).toThrow(/unauthorized/i);
    expect(() => requireServiceToken("expected")).not.toThrow();
  });

  it("removes owner, credential, input, session, storage, and provider request metadata from public runs", () => {
    const publicSnapshot = publicRunSnapshot({
      assets: [{ _id: "asset", kind: "mp4", runId: "run", stepId: "render", storageKey: "private/key", url: "https://cdn.test/a.mp4" }],
      feedback: [{ kind: "judge_score", rater: "vlm", runId: "run", scores: { overall: 1 } }],
      run: {
        costUsd: 1,
        credentialMode: "wzrd-cloud",
        inputs: { SECRET_PROMPT: "private" },
        principalId: "wallet:0x0000000000000000000000000000000000000000",
        runId: "run",
        sessionId: "session",
        status: "done",
        userId: "user",
        zapSlug: "world-cup-entrance",
        zapVersion: 2,
      },
      steps: [{ kind: "video.gen", providerRequestId: "provider-secret", runId: "run", status: "done", stepId: "render" }],
    });

    expect(publicSnapshot.run).not.toHaveProperty("principalId");
    expect(publicSnapshot.run).not.toHaveProperty("inputs");
    expect(publicSnapshot.run).not.toHaveProperty("credentialMode");
    expect(publicSnapshot.run).not.toHaveProperty("sessionId");
    expect(publicSnapshot.run).not.toHaveProperty("userId");
    expect(publicSnapshot.assets[0]).not.toHaveProperty("storageKey");
    expect(publicSnapshot.steps[0]).not.toHaveProperty("providerRequestId");
    expect(publicSnapshot.feedback[0]).not.toHaveProperty("rater");
  });

  it("makes private Air iMessage video runs entirely unavailable to public queries", () => {
    const publicSnapshot = publicRunSnapshot({
      assets: [{ _id: "asset", kind: "mp4", runId: "air_abcdef012345abcdef012345", stepId: "seedance", url: "https://blob.test/video.mp4" }],
      feedback: [],
      run: {
        costUsd: 0.76,
        runId: "air_abcdef012345abcdef012345",
        status: "done",
        zapSlug: "air-imessage-video",
        zapVersion: 1,
      },
      steps: [{ kind: "video.gen", runId: "air_abcdef012345abcdef012345", status: "done", stepId: "seedance" }],
    });

    expect(publicSnapshot).toEqual({ assets: [], feedback: [], run: null, steps: [] });
  });
});
