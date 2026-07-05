import { defineTool } from "eve/tools";
import { z } from "zod";
import { submitGeneration } from "../../lib/providers/router.js";

export default defineTool({
  description: "Submit a video generation or extension request through the Zap provider router.",
  inputSchema: z.object({
    durationS: z.number().positive().default(15),
    imageUrl: z.string().url().optional(),
    kind: z.enum(["video.gen", "video.extend"]).default("video.gen"),
    model: z.string().default("seedance-2-0-260128"),
    prompt: z.string().min(1),
    provider: z.enum(["gmi", "fal", "prodia", "runware"]).optional(),
    runId: z.string(),
    stepId: z.string(),
  }),
  approval: ({ toolInput }) => {
    const duration = typeof toolInput?.durationS === "number" ? toolInput.durationS : 0;
    return duration > 120 ? "user-approval" : "not-applicable";
  },
  async execute(input) {
    return submitGeneration({
      capability: input.kind,
      durationS: input.durationS,
      inputs: { imageUrl: input.imageUrl },
      model: input.model,
      prompt: input.prompt,
      provider: input.provider ?? "gmi",
      runId: input.runId,
      stepId: input.stepId,
    });
  },
  toModelOutput(output) {
    return { type: "text", value: `${output.provider} video request ${output.requestId}` };
  },
});
