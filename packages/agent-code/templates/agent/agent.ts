import { defineAgent, useInput, useModel } from "@wzrdtech/zap-agent";

export default defineAgent(function Agent() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  return input.text
    ? `Do the work. Plan-only unless --live. Request: ${input.text}`
    : "You are a Zap CPU agent. Plan first.";
});
