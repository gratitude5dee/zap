import { describe, expect, it } from "vitest";
import { createRunLedger, getRunSnapshot } from "../lib/run-ledger";

describe("run ledger LLM routing metadata", () => {
  it("persists the selected route and model on a run", async () => {
    const runId = `run_llm_route_${Date.now()}`;
    await createRunLedger({
      inputs: { prompt: "make a Zap" },
      llmModel: "claude-sonnet-4-6",
      llmRoute: "anthropic",
      runId,
      zapSlug: "llm-route-demo",
      zapVersion: 1,
    });

    const snapshot = await getRunSnapshot(runId);
    expect(snapshot.run).toMatchObject({
      llmModel: "claude-sonnet-4-6",
      llmRoute: "anthropic",
      runId,
    });
  });
});
