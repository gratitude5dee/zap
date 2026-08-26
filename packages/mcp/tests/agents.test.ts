// The agents-as-code MCP tool module (Z12): the six zap_agent_*/zap_session*/
// zap_secret_list tools are exported and registered, live defaults to false,
// no secret-writing tool exists, and no tool description promises values.
import { describe, expect, it } from "vitest";
import { ZAP_MCP_TOOLS } from "../src/server.js";
import { register, toolNames } from "../src/tools/agents.js";

const EXPECTED = [
  "zap_agent_ls",
  "zap_agent_render",
  "zap_deploy_agent",
  "zap_session",
  "zap_sessions_ls",
  "zap_secret_list",
];

interface RegisteredTool {
  config: {
    description?: string;
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    inputSchema?: Record<string, { parse(value: unknown): unknown }>;
  };
}

function collectRegistrations(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(name: string, config: RegisteredTool["config"]) {
      tools.set(name, { config });
    },
  };
  register(server as never);
  return tools;
}

describe("MCP agents tool module", () => {
  it("exports exactly the §5.10 Z12 tool names and they are in ZAP_MCP_TOOLS", () => {
    expect([...toolNames].sort()).toEqual([...EXPECTED].sort());
    for (const name of EXPECTED) expect(ZAP_MCP_TOOLS).toContain(name);
  });

  it("registers every tool with annotations and no secret-writing tool", () => {
    const tools = collectRegistrations();
    expect([...tools.keys()].sort()).toEqual([...EXPECTED].sort());
    for (const [name, tool] of tools) {
      const annotations = tool.config.annotations ?? {};
      expect(
        annotations.readOnlyHint === true || annotations.destructiveHint === true,
        `${name} needs an annotation`,
      ).toBe(true);
    }
    expect(tools.has("zap_secret_set")).toBe(false);
  });

  it("read-only tools are marked readOnlyHint and session/deploy are destructive", () => {
    const tools = collectRegistrations();
    for (const name of ["zap_agent_ls", "zap_agent_render", "zap_sessions_ls", "zap_secret_list"]) {
      expect(tools.get(name)?.config.annotations?.readOnlyHint).toBe(true);
    }
    for (const name of ["zap_session", "zap_deploy_agent"]) {
      expect(tools.get(name)?.config.annotations?.destructiveHint).toBe(true);
    }
  });

  it("zap_session live defaults to false (plan-only, C5)", () => {
    const tools = collectRegistrations();
    const schema = tools.get("zap_session")?.config.inputSchema;
    expect(schema).toBeDefined();
    const live = schema!.live;
    expect(live.parse(undefined)).toBe(false);
  });
});
