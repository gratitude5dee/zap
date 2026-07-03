import { defineTool } from "eve/tools";
import { z } from "zod";
import { submitGeneration } from "../../lib/providers/router.js";

export default defineTool({
  description: "Submit a voice, music, or SFX request through the Zap provider router.",
  inputSchema: z.object({
    kind: z.enum(["audio.tts", "audio.music", "audio.sfx"]),
    model: z.string().default("elevenlabs/music"),
    prompt: z.string().min(1),
    provider: z.enum(["fal"]).default("fal"),
    runId: z.string(),
    stepId: z.string(),
  }),
  async execute(input) {
    return submitGeneration({
      capability: input.kind,
      inputs: {},
      model: input.model,
      prompt: input.prompt,
      provider: input.provider,
      runId: input.runId,
      stepId: input.stepId,
    });
  },
});
