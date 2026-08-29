// Every CLI-backed MCP tool must shell out to a subcommand the CLI actually
// implements, with the argv shape the CLI parses. These tests pin the
// mappings that have drifted before (harness doctor, memory remember) and
// the connectivity surface, which must never accept a raw credential value.
import { describe, expect, it, vi } from "vitest";

const cliCalls: string[][] = [];
vi.mock("../src/tool-helpers.js", () => ({
  cliTool: async (args: string[]) => {
    cliCalls.push(args);
    return { content: [{ text: "{}", type: "text" }] };
  },
  toolJson: (value: unknown) => ({ content: [{ text: JSON.stringify(value), type: "text" }] }),
  toolError: (payload: unknown) => ({ content: [{ text: JSON.stringify(payload), type: "text" }], isError: true }),
  PAYER_MISSING_REMEDIATION: [],
}));

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

interface Registered {
  config: {
    annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
    inputSchema?: Record<string, unknown>;
  };
  handler: Handler;
}

async function load(module: string): Promise<Map<string, Registered>> {
  const { register } = await import(module);
  const tools = new Map<string, Registered>();
  register({
    registerTool(name: string, config: Registered["config"], handler: Handler) {
      tools.set(name, { config, handler });
    },
  } as never);
  return tools;
}

async function argvFor(tools: Map<string, Registered>, name: string, args: Record<string, unknown>): Promise<string[]> {
  cliCalls.length = 0;
  const tool = tools.get(name);
  expect(tool, `${name} is registered`).toBeDefined();
  await tool?.handler(args);
  expect(cliCalls.length).toBe(1);
  return cliCalls[0] ?? [];
}

describe("zap_harness_doctor maps to the CLI's positional target", () => {
  it("passes the harness as the positional <id|template> argument", async () => {
    const tools = await load("../src/tools/harness.js");
    const argv = await argvFor(tools, "zap_harness_doctor", { harness: "hermes" });
    expect(argv).toEqual(["harness", "doctor", "hermes", "--json"]);
  });

  it("prefers the runtimeId when both are given", async () => {
    const tools = await load("../src/tools/harness.js");
    const argv = await argvFor(tools, "zap_harness_doctor", { harness: "hermes", runtimeId: "rt_1" });
    expect(argv).toEqual(["harness", "doctor", "rt_1", "--json"]);
  });
});

describe("zap_memory_remember maps to a real CLI subcommand", () => {
  it("durable remember", async () => {
    const tools = await load("../src/tools/memory.js");
    const argv = await argvFor(tools, "zap_memory_remember", { durable: true, text: "note" });
    expect(argv).toEqual(["memory", "remember", "note", "--json"]);
  });

  it("non-durable remember uses --ephemeral (--session takes an id in the CLI)", async () => {
    const tools = await load("../src/tools/memory.js");
    const argv = await argvFor(tools, "zap_memory_remember", { durable: false, text: "note" });
    expect(argv).toEqual(["memory", "remember", "note", "--json", "--ephemeral"]);
  });

  it("search session scope maps to --session, a flag the CLI parses", async () => {
    const tools = await load("../src/tools/memory.js");
    const argv = await argvFor(tools, "zap_memory_search", { query: "deploy", session: "s1" });
    expect(argv).toEqual(["memory", "search", "deploy", "--session", "s1", "--json"]);
  });
});

describe("runtime connectivity MCP surface", () => {
  it("status is read-only and maps to zap runtime connectivity status", async () => {
    const tools = await load("../src/tools/connectivity.js");
    const status = tools.get("zap_runtime_connectivity_status");
    expect(status?.config.annotations?.readOnlyHint).toBe(true);
    const argv = await argvFor(tools, "zap_runtime_connectivity_status", { runtimeId: "rt_1" });
    expect(argv).toEqual(["runtime", "connectivity", "status", "rt_1", "--json"]);
  });

  it("enable passes credentials only as file paths, never raw values", async () => {
    const tools = await load("../src/tools/connectivity.js");
    const enable = tools.get("zap_runtime_connectivity_enable");
    expect(enable?.config.annotations?.destructiveHint).toBe(true);
    const schemaKeys = Object.keys(enable?.config.inputSchema ?? {});
    for (const key of schemaKeys) {
      expect(key).not.toMatch(/^(authKey|bootstrapToken|meshInviteToken|token|secret)$/);
    }
    const argv = await argvFor(tools, "zap_runtime_connectivity_enable", {
      feature: "tailscale",
      runtimeId: "rt_1",
      authKeyFile: "/home/user/.zap/authkey",
      hostname: "my-box",
    });
    expect(argv).toEqual([
      "runtime", "connectivity", "enable", "rt_1", "tailscale",
      "--auth-key-file", "/home/user/.zap/authkey",
      "--hostname", "my-box",
      "--json",
    ]);
  });

  it("enable samMesh maps control plane and token files to the CLI flags", async () => {
    const tools = await load("../src/tools/connectivity.js");
    const argv = await argvFor(tools, "zap_runtime_connectivity_enable", {
      feature: "samMesh",
      runtimeId: "rt_1",
      controlPlane: "https://mesh.owner.example",
      bootstrapTokenFile: "/tmp/bt",
    });
    expect(argv).toEqual([
      "runtime", "connectivity", "enable", "rt_1", "samMesh",
      "--control-plane", "https://mesh.owner.example",
      "--bootstrap-token-file", "/tmp/bt",
      "--json",
    ]);
  });

  it("disable maps to the CLI disable subcommand", async () => {
    const tools = await load("../src/tools/connectivity.js");
    const argv = await argvFor(tools, "zap_runtime_connectivity_disable", { feature: "cotal", runtimeId: "rt_1" });
    expect(argv).toEqual(["runtime", "connectivity", "disable", "rt_1", "cotal", "--json"]);
  });
});
