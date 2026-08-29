// Link agent-wallet MCP tools: argv mapping matches the CLI contract, no
// tool returns or accepts a raw payment credential (file paths only, C24),
// and connect (interactive) is deliberately not exposed.
import { afterEach, describe, expect, it, vi } from "vitest";

interface RegisteredTool {
  config: {
    description?: string;
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    inputSchema?: Record<string, unknown>;
  };
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

const cliCalls: string[][] = [];

vi.mock("../src/tool-helpers.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/tool-helpers.js")>();
  return {
    ...original,
    cliTool: async (args: string[]) => {
      cliCalls.push(args);
      return { content: [{ type: "text", text: "{}" }] };
    },
  };
});

async function collect(): Promise<Map<string, RegisteredTool>> {
  const { register } = await import("../src/tools/pay.js");
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(name: string, config: RegisteredTool["config"], handler: RegisteredTool["handler"]) {
      tools.set(name, { config, handler });
    },
  };
  register(server as never);
  return tools;
}

afterEach(() => {
  cliCalls.length = 0;
});

describe("MCP Link wallet tools", () => {
  it("exposes status/request/retrieve/cancel/list but not connect (interactive)", async () => {
    const { toolNames } = await import("../src/tools/pay.js");
    expect(toolNames).toContain("zap_pay_link_status");
    expect(toolNames).toContain("zap_pay_link_request");
    expect(toolNames).toContain("zap_pay_link_retrieve");
    expect(toolNames).toContain("zap_pay_link_cancel");
    expect(toolNames).toContain("zap_pay_link_list");
    expect(toolNames).toContain("zap_pay_link_pay");
    expect(toolNames.some((name: string) => name.includes("connect"))).toBe(false);
  });

  it("no Link tool accepts a raw credential field — file paths only", async () => {
    const tools = await collect();
    for (const [name, tool] of tools) {
      const keys = Object.keys(tool.config.inputSchema ?? {});
      for (const key of keys) {
        expect(
          /token$|^card|number|cvc|secret/i.test(key),
          `${name}.${key} must not carry a raw credential`,
        ).toBe(false);
      }
    }
  });

  it("zap_pay_link_request maps to the CLI create contract", async () => {
    const tools = await collect();
    await tools.get("zap_pay_link_request")?.handler({
      amount: 500,
      context: "c".repeat(120),
      credentialType: "card",
      currency: "usd",
      merchantName: "Example",
      merchantUrl: "https://merchant.example",
      outputFile: "/tmp/card.json",
      test: true,
    });
    expect(cliCalls[0]).toEqual([
      "pay",
      "link",
      "request",
      "--amount",
      "500",
      "--currency",
      "usd",
      "--context",
      "c".repeat(120),
      "--credential-type",
      "card",
      "--json",
      "--merchant-name",
      "Example",
      "--merchant-url",
      "https://merchant.example",
      "--output-file",
      "/tmp/card.json",
      "--test",
    ]);
  });

  it("zap_pay_link_retrieve forwards output file and include flag", async () => {
    const tools = await collect();
    await tools.get("zap_pay_link_retrieve")?.handler({
      id: "spr_1",
      includeCard: true,
      outputFile: "/tmp/card.json",
      timeout: 60,
    });
    expect(cliCalls[0]).toEqual([
      "pay",
      "link",
      "retrieve",
      "spr_1",
      "--json",
      "--output-file",
      "/tmp/card.json",
      "--include",
      "card",
      "--timeout",
      "60",
    ]);
  });

  it("zap_pay_link_pay maps to the CLI mpp pay contract", async () => {
    const tools = await collect();
    await tools.get("zap_pay_link_pay")?.handler({
      spendRequestId: "spr_1",
      test: true,
      url: "https://merchant.example/resource",
    });
    expect(cliCalls[0]).toEqual([
      "pay",
      "link",
      "pay",
      "https://merchant.example/resource",
      "--json",
      "--spend-request-id",
      "spr_1",
      "--test",
    ]);
  });

  it("status and list are read-only; request, cancel, and pay are destructive; retrieve is not read-only", async () => {
    const tools = await collect();
    expect(tools.get("zap_pay_link_status")?.config.annotations?.readOnlyHint).toBe(true);
    expect(tools.get("zap_pay_link_list")?.config.annotations?.readOnlyHint).toBe(true);
    expect(tools.get("zap_pay_link_request")?.config.annotations?.destructiveHint).toBe(true);
    expect(tools.get("zap_pay_link_cancel")?.config.annotations?.destructiveHint).toBe(true);
    expect(tools.get("zap_pay_link_pay")?.config.annotations?.destructiveHint).toBe(true);
    expect(tools.get("zap_pay_link_retrieve")?.config.annotations?.readOnlyHint).toBe(false);
  });
});
