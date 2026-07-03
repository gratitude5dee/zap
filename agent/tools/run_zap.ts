import { defineTool } from "eve/tools";
import { z } from "zod";
import { runZapRecipe } from "../../lib/zap-runner-server.js";

export default defineTool({
  description: "Execute a Zap recipe deterministically from its frontmatter and return run metadata.",
  inputSchema: z.object({
    extendCount: z.number().int().min(0).max(64).default(0),
    inputs: z.record(z.string(), z.unknown()).default({}),
    slug: z.string(),
  }),
  async execute(input) {
    return runZapRecipe(input);
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Zap ${output.runId} ${output.status}: quoted $${output.quoteUsd.toFixed(2)}. ${output.message}`,
    };
  },
});
