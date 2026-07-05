import { defineTool } from "eve/tools";
import { z } from "zod";
import { submitGeneration } from "../../lib/providers/router.js";

export default defineTool({
  description: "Submit a video edit or ReViz request through the Zap provider router.",
  inputSchema: z.object({
    model: z.string().default("gemini-omni-flash-preview"),
    prompt: z.string().min(1),
    provider: z.enum(["gmi", "fal", "prodia", "runware"]).optional(),
    runId: z.string(),
    stepId: z.string(),
    videoUrl: z.string().url(),
  }),
  approval: () => "user-approval",
  async execute(input) {
    return submitGeneration({
      capability: "video.edit",
      inputs: { videoUrl: input.videoUrl },
      model: input.model,
      prompt: input.prompt,
      provider: input.provider ?? "gmi",
      runId: input.runId,
      stepId: input.stepId,
    });
  },
});
