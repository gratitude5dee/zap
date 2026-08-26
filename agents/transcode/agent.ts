import { defineAgent, defineTool, useInput, useModel, useTool, useSubagent } from "@wzrdtech/zap-agent";

export const transcode = defineTool({
  name: "ffmpeg_transcode",
  description: "Transcode a file on the Zap CPU sandbox",
  input: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
  async run({ input, sandbox, signal, reportProgress }) {
    await reportProgress({ phase: "exec" });
    return sandbox.exec(
      ["ffmpeg", "-i", String(input.path), "-y", "/zap/fs/out.mp4"],
      { signal },
    );
  },
});

export default defineAgent(function Agent() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  if (/transcode|ffmpeg/i.test(input.text ?? "")) useTool(transcode);
  if (/research/i.test(input.text ?? "")) useSubagent("researcher");
  return input.text
    ? `Do the work. Plan-only unless --live. Request: ${input.text}`
    : "You are a Zap CPU agent. Plan first.";
});
