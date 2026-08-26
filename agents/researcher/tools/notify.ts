import { defineTool } from "@wzrdtech/zap-agent";
export const notify = defineTool({ name: "notify", description: "POST a completion note to the declared webhook",
  input: { type: "object", properties: { note: { type: "string" } }, required: ["note"], additionalProperties: false },
  async run({ input, connections, signal }) { const r = await connections.webhook.fetch("/zap/done", { method: "POST", body: JSON.stringify({ note: input.note }), signal }); return { status: r.status }; } });
