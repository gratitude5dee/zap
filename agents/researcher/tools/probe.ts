import { defineTool } from "@wzrdtech/zap-agent";
export const probe = defineTool({ name: "ffprobe", description: "Inspect a media file (read-only)", readOnly: true,
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  run: ({ input, sandbox, signal }) => sandbox.exec(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", String(input.path)], { signal }) });
