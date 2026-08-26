// C13/C14: the agent function is a synchronous render inside a guard.
import { describe, expect, it } from "vitest";
import { defineAgent, renderAgent, useInput, useModel, type AgentInput } from "../src/index.ts";
import transcodeAgent from "../../../agents/transcode/agent.ts";

function input(text: string, overrides: Partial<AgentInput> = {}): AgentInput {
  return { source: "cli", text, live: false, sessionId: "s1", turn: 1, alias: "development", ...overrides };
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code ?? "";
  }
  return "";
}

describe("render guard", () => {
  it("throws AGENT_RENDER_IO on fetch", () => {
    const agent = defineAgent(() => {
      void fetch("https://example.com");
      return "x";
    });
    expect(codeOf(() => renderAgent(agent, { input: input("hi") }))).toBe("AGENT_RENDER_IO");
  });

  it("throws AGENT_RENDER_IO on setTimeout, setInterval, queueMicrotask", () => {
    for (const body of [
      () => setTimeout(() => {}, 1),
      () => setInterval(() => {}, 1),
      () => queueMicrotask(() => {}),
    ]) {
      const agent = defineAgent(() => {
        body();
        return "x";
      });
      expect(codeOf(() => renderAgent(agent, { input: input("hi") }))).toBe("AGENT_RENDER_IO");
    }
  });

  it("throws AGENT_RENDER_IO when the render reads process.env", () => {
    const agent = defineAgent(() => `key=${process.env.SOME_KEY ?? ""}`);
    expect(codeOf(() => renderAgent(agent, { input: input("hi") }))).toBe("AGENT_RENDER_IO");
  });

  it("throws AGENT_RENDER_ASYNC for an async agent", () => {
    const agent = defineAgent((async () => "x") as unknown as () => string);
    expect(codeOf(() => renderAgent(agent, { input: input("hi") }))).toBe("AGENT_RENDER_ASYNC");
  });

  it("throws AGENT_RENDER_TYPE for a non-string return", () => {
    const agent = defineAgent(() => 42 as unknown as string);
    expect(codeOf(() => renderAgent(agent, { input: input("hi") }))).toBe("AGENT_RENDER_TYPE");
  });

  it("throws HOOK_OUTSIDE_RENDER for hooks called outside a render frame", () => {
    expect(codeOf(() => useInput())).toBe("HOOK_OUTSIDE_RENDER");
    expect(codeOf(() => useModel("openrouter/anthropic/claude-sonnet-4.6"))).toBe("HOOK_OUTSIDE_RENDER");
  });

  it("throws AGENT_NO_MODEL when no model is selected and no default exists", () => {
    const agent = defineAgent(() => "hello");
    expect(codeOf(() => renderAgent(agent, { input: input("hi") }))).toBe("AGENT_NO_MODEL");
  });

  it("falls back to the runtime default model", () => {
    const agent = defineAgent(() => "hello");
    const result = renderAgent(agent, { input: input("hi"), defaultModel: "openrouter/anthropic/claude-sonnet-4.6" });
    expect(result.capabilities.model).toBe("openrouter/anthropic/claude-sonnet-4.6");
  });

  it("restores globals after the render", () => {
    const agent = defineAgent(() => "ok");
    const beforeFetch = globalThis.fetch;
    const beforeTimeout = globalThis.setTimeout;
    renderAgent(agent, { input: input("hi"), defaultModel: "openrouter/anthropic/claude-sonnet-4.6" });
    expect(globalThis.fetch).toBe(beforeFetch);
    expect(globalThis.setTimeout).toBe(beforeTimeout);
    expect(process.env.PATH).toBeDefined();
  });

  it("renders the canonical agent deterministically", () => {
    const first = renderAgent(transcodeAgent, { input: input("transcode a.mp4") });
    const second = renderAgent(transcodeAgent, { input: input("transcode a.mp4") });
    expect(first.instructions).toBe("Do the work. Plan-only unless --live. Request: transcode a.mp4");
    expect(second.instructions).toBe(first.instructions);
    expect([...second.capabilities.tools.keys()]).toEqual([...first.capabilities.tools.keys()]);
    expect(first.capabilities.model).toBe("openrouter/anthropic/claude-sonnet-4.6");
  });
});
