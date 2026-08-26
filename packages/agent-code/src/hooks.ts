// Render hooks (§4.12): select capabilities, never perform work.
import { currentFrame } from "./render/frame.ts";
import type { AgentInput, ModelId, Tool, ToolInput } from "./types.ts";

export function useInput(): AgentInput {
  return currentFrame("useInput").input;
}

export function useModel(
  id: ModelId,
  opts?: { reasoning?: "low" | "medium" | "high"; maxOutputTokens?: number },
): void {
  const frame = currentFrame("useModel");
  frame.capabilities.model = id;
  frame.capabilities.modelOptions = opts;
}

export function useTool<I extends ToolInput, O>(tool: Tool<I, O>): void {
  const frame = currentFrame("useTool");
  frame.capabilities.tools.set(tool.definition.name, tool as Tool<ToolInput, unknown>);
}

export function useMcpServer(id: string): void {
  currentFrame("useMcpServer").capabilities.mcpServers.add(id);
}

export function useSubagent(id: string, opts?: { maxTurns?: number }): void {
  currentFrame("useSubagent").capabilities.subagents.set(id, { maxTurns: opts?.maxTurns });
}

/** sync; reads the snapshot taken before the render started */
export function useSessionData<T = unknown>(key: string): T | undefined {
  return currentFrame("useSessionData").sessionData[key] as T | undefined;
}
