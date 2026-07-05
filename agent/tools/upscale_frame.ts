import { defineTool } from "eve/tools";
import { z } from "zod";
import { submitGeneration } from "../../lib/providers/router.js";

export default defineTool({
  description: "Upscale a frame for ExtendGen conditioning.",
  inputSchema: z.object({
    imageUrl: z.string().url(),
    model: z.string().default("seedance-2-0-260128-upscale"),
    provider: z.enum(["gmi", "fal", "prodia", "runware"]).optional(),
    runId: z.string(),
    stepId: z.string(),
  }),
  async execute(input) {
    return submitGeneration({
      capability: "video.upscale",
      inputs: { imageUrl: input.imageUrl },
      model: input.model,
      prompt: "Upscale this frame to 4K while preserving identity and composition.",
      provider: input.provider ?? "gmi",
      runId: input.runId,
      stepId: input.stepId,
    });
  },
});
