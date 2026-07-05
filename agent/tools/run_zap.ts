import { defineTool } from "eve/tools";
import { z } from "zod";
import { ZapRunError } from "../../lib/zap-errors.js";
import { createZapRunTicket, startZapRunExecution } from "../../lib/zap-runner-server.js";
import { zapBudget } from "../lib/budget.js";

export default defineTool({
  description: "Submit a Zap recipe run, or dry-run it, and return a fast run ticket with quote and status URL.",
  inputSchema: z.object({
    dryRun: z.boolean().default(false),
    extendCount: z.number().int().min(0).max(64).default(0),
    inputs: z.record(z.string(), z.unknown()).default({}),
    live: z.boolean().default(false),
    provider: z.enum(["gmi", "fal", "prodia", "runware"]).optional(),
    slug: z.string(),
  }),
  approval: ({ toolInput }) => {
    const input = toolInput as { live?: boolean } | undefined;
    return input?.live ? "user-approval" : "not-applicable";
  },
  async execute(input) {
    if (!input.dryRun) {
      const rehearsal = await createZapRunTicket({ ...input, dryRun: true });
      const budget = zapBudget.get();
      const remaining = budget.capUsd - budget.spentUsd;
      if (rehearsal.response.quoteUsd > remaining) {
        throw new ZapRunError({
          alternatives: ["Run quote_zap first", "Reduce extendCount", "Ask for a higher session budget cap"],
          code: "BUDGET_EXCEEDED",
          message: `Run quote $${rehearsal.response.quoteUsd.toFixed(2)} exceeds session remaining budget $${remaining.toFixed(2)}.`,
          remediation: "Reduce the Zap scope or get user approval before spending beyond the session cap.",
          retryable: false,
        });
      }
    }

    const result = await createZapRunTicket(input);
    if (result.execution) {
      zapBudget.update((current) => {
        const runs = {
          ...current.runs,
          [result.response.runId]: {
            quoteUsd: result.response.quoteUsd,
            status: result.response.status,
          },
        };
        return {
          ...current,
          currentRunId: result.response.runId,
          runs,
          spentUsd: totalBudgetSpent(runs),
        };
      });
      startZapRunExecution(result.execution);
    }
    return result.response;
  },
  toModelOutput(output) {
    const mode = output.dryRun ? "planned" : output.status;
    return {
      type: "text",
      value: `Zap ${output.runId} ${mode}: quoted $${output.quoteUsd.toFixed(2)}. ${output.message} Observe at ${output.statusUrl}.`,
    };
  },
});

function totalBudgetSpent(runs: Record<string, { actualUsd?: number; quoteUsd: number }>) {
  return Object.values(runs).reduce((sum, run) => sum + (run.actualUsd ?? run.quoteUsd), 0);
}
