import { defineTool } from "eve/tools";
import { z } from "zod";
import { submitGeneration } from "../../lib/providers/router.js";

export default defineTool({
  description: "Submit an image generation or image edit request through the Zap provider router.",
  inputSchema: z.object({
    imageUrl: z.string().url().optional(),
    model: z.string().default("fal-ai/flux/dev"),
    prompt: z.string().min(1),
    provider: z.enum(["gmi", "fal", "prodia", "runware"]).optional(),
    runId: z.string(),
    stepId: z.string(),
  }),
  async execute(input) {
    return submitGeneration({
      capability: input.imageUrl ? "image.edit" : "image.gen",
      inputs: { imageUrl: input.imageUrl },
      model: input.model,
      prompt: input.prompt,
      provider: input.provider ?? "fal",
      runId: input.runId,
      stepId: input.stepId,
    });
  },
  toModelOutput(output) {
    return { type: "text", value: `${output.provider} image request ${output.requestId}` };
  },
});
