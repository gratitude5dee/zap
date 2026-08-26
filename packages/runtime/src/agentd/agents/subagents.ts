// Subagent delegation (§5.12): a subagent turn runs on the same deployment in
// an ephemeral child session, inheriting the parent's live/payer settings.
import type { AgentEvent } from "@wzrdtech/zap-agent";
import { runTurn, type TurnDeps, type TurnInput } from "./turns.ts";
import type { SessionStore } from "./sessions.ts";

export interface DelegateDeps {
  sessions: SessionStore;
  deploymentId: string;
  alias: string;
  makeTurnDeps(agentId: string): TurnDeps | null;
}

export async function delegateToSubagent(
  deps: DelegateDeps,
  subagentId: string,
  input: { text?: string; payload?: unknown },
  parentTurn: TurnInput,
): Promise<string> {
  const turnDeps = deps.makeTurnDeps(subagentId);
  if (!turnDeps) return `Unknown subagent ${subagentId}.`;
  const child = await deps.sessions.create({
    agent: subagentId,
    alias: deps.alias,
    deploymentId: deps.deploymentId,
  });
  const events: AgentEvent[] = [];
  for await (const event of runTurn(
    turnDeps,
    child,
    { ...input, live: parentTurn.live, payer: parentTurn.payer, source: "subagent" },
  )) {
    events.push(event);
  }
  const completed = events.find((event) => event.type === "turn.completed");
  if (completed && completed.type === "turn.completed") return completed.text;
  const failed = events.find((event) => event.type === "turn.failed");
  if (failed && failed.type === "turn.failed") return `Subagent ${subagentId} failed: ${failed.code}.`;
  return "";
}
