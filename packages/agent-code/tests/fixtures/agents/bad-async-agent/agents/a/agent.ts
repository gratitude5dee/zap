import { defineAgent, useModel } from "@wzrdtech/zap-agent";
export default defineAgent(async function A() {
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  return "never";
} as unknown as () => string);
