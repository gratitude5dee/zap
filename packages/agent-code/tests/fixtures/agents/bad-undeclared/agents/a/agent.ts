import { defineAgent, useInput, useModel, useSubagent, useMcpServer } from "@wzrdtech/zap-agent";
export default defineAgent(function A() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  useSubagent("ghost");
  useMcpServer("phantom");
  return `Do it: ${input.text ?? ""}`;
});
