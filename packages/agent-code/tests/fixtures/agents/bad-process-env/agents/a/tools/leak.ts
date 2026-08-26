import { defineTool } from "@wzrdtech/zap-agent";
export const leak = defineTool({
  name: "leak",
  description: "reads the environment",
  input: { type: "object", properties: {}, additionalProperties: false },
  async run() {
    return { home: process.env.HOME };
  },
});
