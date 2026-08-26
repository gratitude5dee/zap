// Z11 hardening: a missing payer fails closed with PAYER_MISSING before any
// model call, in both plan-only and live modes — never a silent downgrade.
import { describe, expect, it } from "vitest";
import { defineTool, type AnyTool, type ToolContext } from "@wzrdtech/zap-agent";
import { createContext, type Context } from "@wzrdtech/zap-kernel";
import type { LlmStepResult } from "../../src/gateway/index.ts";
import { executeStep, resolvePayerMode, type StepCapabilities, type StepEvent } from "../../src/harness/zap.ts";
import { fakePayService } from "../../src/testing.ts";

function spyLlm() {
  const calls: unknown[] = [];
  return {
    calls,
    service: {
      async step(req: unknown): Promise<LlmStepResult> {
        calls.push(req);
        return { text: "ok", toolCalls: [], usage: { inputTokens: 1, outputTokens: 1, usd: 0 } };
      },
    },
  };
}

const noopTool = defineTool({
  name: "noop",
  description: "No-op tool.",
  input: { type: "object" },
  async run() {
    return null;
  },
}) as AnyTool;

function toolContextFor(live: boolean): Omit<ToolContext<never>, "input" | "signal"> {
  return {
    sandbox: {
      async exec() {
        throw new Error("sandbox must not run");
      },
    },
    fs: {
      async read() {
        return null;
      },
      async write() {},
      async readdir() {
        return [];
      },
    },
    connections: {},
    session: {
      id: "security-payer",
      alias: "security",
      data: {
        async get() {
          return undefined;
        },
        async set() {},
      },
    },
    async reportProgress() {},
    live,
    log() {},
  };
}

function caps(): StepCapabilities {
  return {
    instructions: "Plan-only unless --live.",
    model: "gateway/anthropic/claude-sonnet-4.6",
    tools: new Map([[noopTool.definition.name, noopTool]]),
    mcpServers: new Set(),
    subagents: new Map(),
  };
}

function stepOpts(live: boolean, events: StepEvent[]) {
  return {
    signal: new AbortController().signal,
    history: [{ role: "user" as const, content: "do something" }],
    mcp: new Map(),
    onEvent(event: StepEvent) {
      events.push(event);
    },
    toolContext: toolContextFor(live),
  };
}

describe("PAYER_MISSING fails closed", () => {
  for (const live of [false, true]) {
    it(`${live ? "live" : "plan-only"} run throws PAYER_MISSING before any model call`, async () => {
      const ctx: Context = createContext();
      ctx.provide("pay", fakePayService({ mode: "missing" }));
      const llm = spyLlm();
      ctx.provide("llm", llm.service);
      const events: StepEvent[] = [];
      await expect(executeStep(ctx, caps(), stepOpts(live, events))).rejects.toMatchObject({
        code: "PAYER_MISSING",
      });
      expect(llm.calls).toHaveLength(0);
      expect(events).toEqual([]);
    });
  }

  it("no pay service at all resolves as missing (no default payer)", async () => {
    expect(await resolvePayerMode(undefined)).toBe("missing");
    const ctx: Context = createContext();
    const llm = spyLlm();
    ctx.provide("llm", llm.service);
    await expect(executeStep(ctx, caps(), stepOpts(false, []))).rejects.toMatchObject({
      code: "PAYER_MISSING",
    });
    expect(llm.calls).toHaveLength(0);
  });

  it("byok and managed payers both unblock execution", async () => {
    for (const mode of ["byok", "managed"] as const) {
      const ctx: Context = createContext();
      ctx.provide("pay", fakePayService({ mode }));
      const llm = spyLlm();
      ctx.provide("llm", llm.service);
      const result = await executeStep(ctx, caps(), stepOpts(false, []));
      expect(result.kind).toBe("final");
      expect(llm.calls).toHaveLength(1);
    }
  });
});
