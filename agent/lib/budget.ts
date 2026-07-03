import { defineState } from "eve/context";

export const zapBudget = defineState("zap.budget", () => ({
  capUsd: 25,
  currentRunId: null as string | null,
  spentUsd: 0,
}));
