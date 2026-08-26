// The render frame: per-render mutable capability set, rebuilt from empty on
// every render. Hooks read/write the current frame; there is at most one.
import { AgentCodeError, type AgentInput, type AnyTool, type ModelId } from "../types.ts";

export interface FrameCapabilities {
  model?: ModelId;
  modelOptions?: { reasoning?: "low" | "medium" | "high"; maxOutputTokens?: number };
  tools: Map<string, AnyTool>;
  mcpServers: Set<string>;
  subagents: Map<string, { maxTurns?: number }>;
}

export interface RenderFrame {
  input: AgentInput;
  sessionData: Readonly<Record<string, unknown>>;
  capabilities: FrameCapabilities;
}

let current: RenderFrame | null = null;

export function currentFrame(hook: string): RenderFrame {
  if (!current) {
    throw new AgentCodeError(
      "HOOK_OUTSIDE_RENDER",
      `${hook} may only be called during an agent render.`,
    );
  }
  return current;
}

export function openFrame(input: AgentInput, sessionData: Readonly<Record<string, unknown>>): RenderFrame {
  if (current) {
    throw new AgentCodeError("RENDER_REENTRANT", "a render frame is already open.");
  }
  current = {
    input,
    sessionData,
    capabilities: { tools: new Map(), mcpServers: new Set(), subagents: new Map() },
  };
  return current;
}

export function closeFrame(): void {
  current = null;
}
