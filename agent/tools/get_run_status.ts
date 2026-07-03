import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Return the current status URL for a Zap run.",
  inputSchema: z.object({ runId: z.string() }),
  async execute({ runId }) {
    return { runId, statusUrl: `/runs/${runId}` };
  },
});
