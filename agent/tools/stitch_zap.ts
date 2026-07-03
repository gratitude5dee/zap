import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "Stitch generated video segments into Zap.mp4 inside the Eve sandbox using ffmpeg.",
  inputSchema: z.object({
    outputPath: z.string().default("Zap.mp4"),
    segments: z.array(z.string()).min(1),
  }),
  async execute({ outputPath, segments }, ctx) {
    const sandbox = await ctx.getSandbox();
    const concatList = segments.map((segment) => `file '${segment.replaceAll("'", "'\\''")}'`).join("\n");
    await sandbox.writeTextFile({ content: concatList, path: "segments.txt" });
    const result = await sandbox.run({ command: `ffmpeg -y -f concat -safe 0 -i segments.txt -c copy ${shell(outputPath)}` });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || "ffmpeg stitch failed");
    }
    return { outputPath, segmentCount: segments.length };
  },
});

function shell(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
