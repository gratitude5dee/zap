// zap session / zap sessions ls (Z12, §5.12): plan-only default, JSONL event
// union with --json, PAYER_MISSING fail-closed, and durable resume.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const cli = path.resolve("packages/cli/bin/zap.js");
const repoRoot = path.resolve(".");

function runZap(cwd: string, args: string[], env: Record<string, string> = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runZapExpectFail(cwd: string, args: string[], env: Record<string, string> = {}) {
  try {
    execFileSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: "pipe",
    });
  } catch (error) {
    const failure = error as { status: number | null; stdout: string; stderr: string };
    return { exitCode: failure.status, stdout: failure.stdout, stderr: failure.stderr };
  }
  throw new Error(`expected zap ${args.join(" ")} to fail`);
}

const toolAgent = `import { defineAgent, defineTool, useInput, useModel, useTool } from "@wzrdtech/zap-agent";

const shout = defineTool({
  name: "shout",
  description: "Uppercase text (side-effecting for the plan-only test)",
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
  readOnly: false,
  async run({ input }: { input: { text: string } }) {
    return { text: input.text.toUpperCase() };
  },
});

export default defineAgent(function Echo() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  useTool(shout);
  return \`Echo agent. Request: \${input.text ?? ""}\`;
});
`;

function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "zap-session-"));
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  runZap(root, ["agent", "new", "echo", "--json"]);
  writeFileSync(path.join(root, "agents/echo/agent.ts"), toolAgent);
  runZap(root, ["deploy", "--agent", "--json"]);
  return root;
}

function llmEnv(root: string, steps: unknown[]): Record<string, string> {
  const file = path.join(root, "llm.json");
  writeFileSync(file, JSON.stringify(steps));
  return { ZAP_PAYER_MODE: "byok", ZAP_FAKE_LLM_FIXTURE: file };
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { force: true, recursive: true });
});

describe("zap session", () => {
  it("emits the event union as JSONL with --json and plans side-effecting tools by default", () => {
    const root = makeProject();
    roots.push(root);
    const env = llmEnv(root, [
      { text: "", toolCalls: [{ id: "1", name: "shout", input: { text: "hi" } }] },
      { text: "done" },
    ]);
    const lines = runZap(root, ["session", "--agent", "echo", "--json", "shout hi"], env)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const types = lines.map((event) => event.type);
    expect(types[0]).toBe("turn.started");
    expect(types).toContain("render");
    expect(types).toContain("tool.planned");
    expect(types).not.toContain("tool.result");
    expect(types[types.length - 1]).toBe("turn.completed");
    const started = lines[0];
    expect(started.live).toBe(false);
    const render = lines.find((event) => event.type === "render");
    expect(render.tools).toEqual(["shout"]);
  });

  it("executes side-effecting tools only with --live", () => {
    const root = makeProject();
    roots.push(root);
    const env = llmEnv(root, [
      { text: "", toolCalls: [{ id: "1", name: "shout", input: { text: "hi" } }] },
      { text: "done" },
    ]);
    const lines = runZap(root, ["session", "--agent", "echo", "--live", "--json", "shout hi"], env)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const types = lines.map((event) => event.type);
    expect(types).toContain("tool.result");
    expect(types).not.toContain("tool.planned");
    expect(lines[0].live).toBe(true);
  });

  it("fails closed with PAYER_MISSING when no payer is configured (plan-only too)", () => {
    const root = makeProject();
    roots.push(root);
    const failure = runZapExpectFail(root, ["session", "--agent", "echo", "--json", "hello"], {
      ZAP_PAYER_MODE: "missing",
    });
    expect(failure.exitCode).toBe(1);
    const lines = failure.stdout.trim().split("\n").map((line: string) => JSON.parse(line));
    const failed = lines.find((event: { type: string }) => event.type === "turn.failed");
    expect(failed.code).toBe("PAYER_MISSING");
  });

  it("resumes a session by id and lists it with zap sessions ls", () => {
    const root = makeProject();
    roots.push(root);
    const env = llmEnv(root, [{ text: "ok" }]);
    const first = runZap(root, ["session", "--agent", "echo", "--json", "one"], env)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const sessionId = first[0].sessionId;
    const second = runZap(root, ["session", "--session", sessionId, "--json", "two"], env)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(second[0].sessionId).toBe(sessionId);
    expect(second[0].turn).toBe(2);
    const sessions = JSON.parse(runZap(root, ["sessions", "ls", "--json"])).sessions;
    const meta = sessions.find((row: { id: string }) => row.id === sessionId);
    expect(meta.turns).toBe(2);
    // the transcript stays in the VM tree, not the control plane mirror
    expect(readFileSync(path.join(root, ".zap/agentd/sessions", sessionId, "messages.jsonl"), "utf8")).toContain("one");
  });
});
