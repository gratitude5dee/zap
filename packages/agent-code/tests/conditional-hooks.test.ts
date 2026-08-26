// Conditional hooks: the capability set is rebuilt from empty on every render.
import { describe, expect, it } from "vitest";
import { renderAgent, type AgentInput } from "../src/index.ts";
import transcodeAgent from "../../../agents/transcode/agent.ts";

function input(text: string): AgentInput {
  return { source: "cli", text, live: false, sessionId: "s1", turn: 1, alias: "development" };
}

describe("conditional hooks", () => {
  it("attaches ffmpeg_transcode only when the input matches /transcode|ffmpeg/i", () => {
    const on = renderAgent(transcodeAgent, { input: input("please transcode a.mp4") });
    expect(on.capabilities.tools.has("ffmpeg_transcode")).toBe(true);
    const off = renderAgent(transcodeAgent, { input: input("say hello") });
    expect(off.capabilities.tools.has("ffmpeg_transcode")).toBe(false);
  });

  it("attaches the researcher subagent only on /research/i", () => {
    const on = renderAgent(transcodeAgent, { input: input("research the topic") });
    expect(on.capabilities.subagents.has("researcher")).toBe(true);
    const off = renderAgent(transcodeAgent, { input: input("transcode a.mp4") });
    expect(off.capabilities.subagents.has("researcher")).toBe(false);
  });

  it("rebuilds capabilities from empty on every render (no hook-order state)", () => {
    const both = renderAgent(transcodeAgent, { input: input("research then ffmpeg") });
    expect(both.capabilities.tools.has("ffmpeg_transcode")).toBe(true);
    expect(both.capabilities.subagents.has("researcher")).toBe(true);

    const neither = renderAgent(transcodeAgent, { input: input("hello") });
    expect(neither.capabilities.tools.size).toBe(0);
    expect(neither.capabilities.subagents.size).toBe(0);
    expect(neither.capabilities.mcpServers.size).toBe(0);
  });
});
