import { defineAgent, useInput, useModel } from "@wzrdtech/zap-agent";
export default defineAgent(function A() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  return `Do it: ${input.text ?? ""}`;
});
