import { defineAgent, useInput, useModel, useTool, useMcpServer } from "@wzrdtech/zap-agent";
import { probe } from "./tools/probe";
import { notify } from "./tools/notify";
export default defineAgent(function Researcher() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6", { reasoning: "low" });
  useMcpServer("context7");
  useTool(probe);
  if (input.live) useTool(notify);
  return `Research the request and answer with sources. Read-only unless --live. Request: ${input.text ?? ""}`;
});
