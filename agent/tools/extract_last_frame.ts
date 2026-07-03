import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Extract the last frame from a video inside the Eve sandbox using ffmpeg.",
  inputSchema: z.object({
    outputPath: z.string().default("LastFrame.png"),
    videoPath: z.string(),
  }),
  async execute({ outputPath, videoPath }, ctx) {
    const sandbox = await ctx.getSandbox();
    const command = `ffmpeg -y -sseof -0.1 -i ${shell(videoPath)} -frames:v 1 ${shell(outputPath)}`;
    const result = await sandbox.run({ command });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "ffmpeg last-frame extraction failed");
    }
    return { outputPath, stdout: result.stdout };
  },
});

function shell(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
