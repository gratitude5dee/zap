// Z10 acceptance: `zap runtime exec --prompt "list /zap/fs"` produces the same
// normalized RunEvent sequence shape on hermes, openclaw, opencode, deepseek,
// and omg (golden JSONL fixtures per adapter, redacted); managed mode carries
// no provider key and points the harness at the gateway proxy; plan-only side
// effects surface as tool.planned and are never executed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@wzrdtech/zap-kernel";
import type { SandboxHandle } from "@wzrdtech/zap-sandbox";
import type { HarnessService, RunInput } from "../src/harness/zap.ts";
import {
  createHermesHarnessService,
  createExoHarnessService,
  createOpenclawHarnessService,
  createOpencodeHarnessService,
  createDeepseekHarnessService,
  createOmgHarnessService,
  type HarnessTransport,
} from "../src/harness/manifests.ts";
import { managedBoxEnv, managedGatewayUrl } from "../src/harness/manifests.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures", "harness-events");
const CANARY = "sk-canary1234567890abcdef";

function golden(name: string): RunEvent[] {
  return readFileSync(path.join(FIXTURES, `${name}.jsonl`), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as RunEvent);
}

async function collect(service: HarnessService, input?: Partial<RunInput>): Promise<RunEvent[]> {
  const handle = await service.run(fakeSandbox(), {
    prompt: 'list /zap/fs',
    live: false,
    payer: "byok",
    ...input,
  });
  const events: RunEvent[] = [];
  for await (const event of handle.events()) events.push(event);
  return events;
}

function fakeSandbox(): SandboxHandle {
  return {
    id: "box_fake",
    provider: "fake",
    capabilities: {},
    async state() {
      return "ready" as const;
    },
    async exec() {
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    fs: {},
    async release() {},
    async captureState() {
      return { provider: "fake", metadata: {} };
    },
  } as unknown as SandboxHandle;
}

function sse(frames: unknown[]): AsyncIterable<string> {
  return (async function* () {
    for (const frame of frames) yield `data: ${JSON.stringify(frame)}\n\n`;
  })();
}

// raw frames per protocol, each including the canary so redaction is proven
const HTTP_RUNS_FRAMES = [
  { type: "tool.call", tool: "fs.list", input: { path: "/zap/fs" } },
  { type: "tool.result", tool: "fs.list", output: ["repos"], usage: undefined },
  { type: "text.delta", text: `Listed /zap/fs (${CANARY})` },
  { type: "run.completed", usage: { tokens: { inputTokens: 10, outputTokens: 5, usd: 0 } } },
];

function httpRunsTransport(): HarnessTransport {
  return {
    async request(req) {
      if (req.method === "POST") return { status: 200, body: { id: "run_1" } };
      return { status: 200, stream: sse(HTTP_RUNS_FRAMES) };
    },
  };
}

function openclawTransport(): HarnessTransport {
  const chunks = [
    {
      choices: [
        { delta: { tool_calls: [{ id: "c1", function: { name: "fs.list", arguments: '{"path":"/zap/fs"}' } }] } },
      ],
    },
    { choices: [{ delta: { role: "tool", tool_call_id: "c1", content: '["repos"]' } }] },
    { choices: [{ delta: { content: `Listed /zap/fs (${CANARY})` } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
  ];
  return {
    async request() {
      return { status: 200, stream: sse(chunks) };
    },
  };
}

function deepseekTransport(executed: string[]): HarnessTransport {
  const lines = [
    { type: "tool.call", tool: "fs.list", input: { path: "/zap/fs" } },
    { type: "tool.result", tool: "fs.list", output: ["repos"] },
    { type: "text.delta", text: `Listed /zap/fs (${CANARY})` },
    { type: "run.completed", usage: { tokens: { inputTokens: 10, outputTokens: 5, usd: 0 } } },
  ];
  return {
    async exec(argv) {
      executed.push(argv.join(" "));
      return { exitCode: 0, stdout: lines.map((l) => JSON.stringify(l)).join("\n"), stderr: "" };
    },
  };
}

function omgTransport(): HarnessTransport {
  const frames = [
    { jsonrpc: "2.0", method: "run.event", params: { type: "tool.call", tool: "fs.list", input: { path: "/zap/fs" } } },
    { jsonrpc: "2.0", method: "run.event", params: { type: "tool.result", tool: "fs.list", output: ["repos"] } },
    { jsonrpc: "2.0", method: "run.event", params: { type: "text.delta", text: `Listed /zap/fs (${CANARY})` } },
    {
      jsonrpc: "2.0",
      method: "run.event",
      params: { type: "run.completed", usage: { tokens: { inputTokens: 10, outputTokens: 5, usd: 0 } } },
    },
  ];
  return {
    async ws() {
      return (async function* () {
        for (const frame of frames) yield JSON.stringify(frame);
      })();
    },
  };
}

describe("harness events normalize to one RunEvent shape", () => {
  const services: Array<{ name: string; service: HarnessService }> = [
    { name: "hermes", service: createHermesHarnessService(httpRunsTransport()) },
    { name: "exo", service: createExoHarnessService(httpRunsTransport()) },
    { name: "openclaw", service: createOpenclawHarnessService(openclawTransport()) },
    { name: "opencode", service: createOpencodeHarnessService(httpRunsTransport()) },
    { name: "deepseek", service: createDeepseekHarnessService(deepseekTransport([])) },
    { name: "omg", service: createOmgHarnessService(omgTransport()) },
  ];

  it.each(services)("$name matches its golden fixture and the shared shape", async ({ name, service }) => {
    const events = await collect(service);
    expect(events).toEqual(golden(name));
    expect(events.map((e) => e.type)).toEqual([
      "run.started",
      "tool.call",
      "tool.result",
      "text.delta",
      "run.completed",
    ]);
  });

  it("all six adapters produce the identical type sequence", async () => {
    const sequences = await Promise.all(
      [
        createHermesHarnessService(httpRunsTransport()),
        createExoHarnessService(httpRunsTransport()),
        createOpenclawHarnessService(openclawTransport()),
        createOpencodeHarnessService(httpRunsTransport()),
        createDeepseekHarnessService(deepseekTransport([])),
        createOmgHarnessService(omgTransport()),
      ].map(async (service) => (await collect(service)).map((e) => e.type)),
    );
    for (const sequence of sequences) expect(sequence).toEqual(sequences[0]);
  });

  it("emitted events and their JSON are redacted (no canary key)", async () => {
    for (const { service } of services.slice(0, 1)) {
      const events = await collect(createHermesHarnessService(httpRunsTransport()));
      expect(JSON.stringify(events)).not.toContain(CANARY);
      void service;
    }
    const events = await collect(createOmgHarnessService(omgTransport()));
    expect(JSON.stringify(events)).not.toContain(CANARY);
  });

  it("plan-only side effects surface as tool.planned and are not executed", async () => {
    const executed: string[] = [];
    const frames = [
      { type: "tool.planned", tool: "fs.write", input: { path: "/zap/fs/x" }, estimate: [] },
      { type: "run.completed", usage: {} },
    ];
    const transport: HarnessTransport = {
      async exec(argv) {
        executed.push(argv.join(" "));
        return { exitCode: 0, stdout: frames.map((l) => JSON.stringify(l)).join("\n"), stderr: "" };
      },
    };
    const events = await collect(createDeepseekHarnessService(transport));
    const types = events.map((e) => e.type);
    expect(types).toContain("tool.planned");
    expect(types).not.toContain("tool.call");
    // exactly one invocation: the plan-only dsh run itself, never a second live exec
    expect(executed).toHaveLength(1);
    expect(executed[0]).toContain("--plan");
  });
});

describe("managed mode wiring", () => {
  it("the fork/box env carries the gateway proxy URL and no provider key", () => {
    const env = managedBoxEnv("opencode", { apiUrl: "https://api.zap.example", runtimeId: "rt_9" });
    const serialized = JSON.stringify(env);
    expect(serialized).toContain(managedGatewayUrl("https://api.zap.example", "rt_9"));
    expect(serialized).not.toMatch(/\bsk-[A-Za-z0-9_-]{16,}\b/);
    expect(serialized).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|XAI_API_KEY/);
    expect(env.ZAP_PAYER_MODE).toBe("managed");
  });

  it("every managed harness base URL points at the gateway proxy", () => {
    for (const id of ["hermes", "openclaw", "opencode", "deepseek", "grok", "omg"] as const) {
      const env = managedBoxEnv(id, { apiUrl: "https://api.zap.example", runtimeId: "rt_9" });
      const urls = Object.values(env).filter((value) => value.startsWith("https://"));
      expect(urls.length, `${id} declares a managed base URL`).toBeGreaterThan(0);
      for (const url of urls) {
        expect(url).toContain("/v1/runtimes/rt_9/gateway");
      }
    }
  });
});
