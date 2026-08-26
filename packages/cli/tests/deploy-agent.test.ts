// zap agent new/render/lint + zap deploy for agents-as-code (Z12, §5.12):
// immutable SHA-keyed deployments, alias moves, and the §12.9 render fixture.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "zap-agents-"));
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  runZap(root, ["agent", "new", "echo", "--json"]);
  return root;
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { force: true, recursive: true });
});

describe("zap agent", () => {
  it("scaffolds a project without a .env and lints clean", () => {
    const root = makeProject();
    roots.push(root);
    expect(existsSync(path.join(root, "agents/echo/agent.ts"))).toBe(true);
    expect(existsSync(path.join(root, ".env"))).toBe(false);
    expect(readFileSync(path.join(root, "agents/echo/README.md"), "utf8")).not.toContain("__AGENT_ID__");
    const lint = JSON.parse(runZap(root, ["agent", "lint", "--json"]));
    expect(lint).toEqual({ findings: [], ok: true });
    const ls = JSON.parse(runZap(root, ["agent", "ls", "--json"]));
    expect(ls.agents).toEqual(["echo"]);
  });

  it("renders deterministically without a model call", () => {
    const root = makeProject();
    roots.push(root);
    const first = runZap(root, ["agent", "render", "--agent", "echo", "--input", "hi", "--json"]);
    const second = runZap(root, ["agent", "render", "--agent", "echo", "--input", "hi", "--json"]);
    expect(second).toBe(first);
    const rendered = JSON.parse(first);
    expect(rendered.instructions).toContain("hi");
    expect(rendered.model).toBe("openrouter/anthropic/claude-sonnet-4.6");
    expect(rendered.secretsBound).toEqual([]);
  });

  it("lints a process.env read as ZAP_BUILD_PROCESS_ENV", () => {
    const root = makeProject();
    roots.push(root);
    const file = path.join(root, "agents/echo/agent.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("return input.text", "const home = process.env.HOME;\n  return input.text"));
    let output = "";
    try {
      runZap(root, ["agent", "lint", "--json"]);
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }
    const lint = JSON.parse(output);
    expect(lint.ok).toBe(false);
    expect(lint.findings.map((issue: { code: string }) => issue.code)).toContain("ZAP_BUILD_PROCESS_ENV");
  });

  it("matches the committed transcode render fixture byte-for-byte (§12.9)", () => {
    const output = runZap(repoRoot, ["agent", "render", "--agent", "transcode", "--input", "transcode a.mp4", "--json"]);
    const fixture = readFileSync(path.join(repoRoot, "packages/cli/tests/fixtures/agent-render.transcode.json"), "utf8");
    expect(output).toBe(fixture);
  });
});

describe("zap deploy (agents)", () => {
  it("registers an immutable deployment and moves aliases explicitly", () => {
    const root = makeProject();
    roots.push(root);
    const first = JSON.parse(runZap(root, ["deploy", "--agent", "--json"]));
    expect(first.alias).toBe("development");
    expect(first.deploymentId).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(path.join(root, ".zap/agentd/deployments", first.deploymentId, "bundle.mjs"))).toBe(true);

    // production only moves with an explicit --alias production
    const promote = JSON.parse(runZap(root, ["deploy", "--alias", "production", "--sha", first.deploymentId, "--json"]));
    expect(promote).toEqual({ alias: "production", deploymentId: first.deploymentId, ok: true });

    // a code change makes a new deployment; development moves, production stays
    const file = path.join(root, "agents/echo/agent.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("Do the work", "Do the new work"));
    const second = JSON.parse(runZap(root, ["deploy", "--agent", "--json"]));
    expect(second.deploymentId).not.toBe(first.deploymentId);
    const history = readFileSync(path.join(root, ".zap/agentd/aliases/history.jsonl"), "utf8").trim().split("\n");
    expect(history.length).toBe(3);
    const production = JSON.parse(readFileSync(path.join(root, ".zap/agentd/aliases/production"), "utf8"));
    expect(production.deploymentId).toBe(first.deploymentId);
  });

  it("keeps open sessions pinned to their deployment across alias moves", () => {
    const root = makeProject();
    roots.push(root);
    const llm = path.join(root, "llm.json");
    writeFileSync(llm, JSON.stringify([{ text: "ok" }]));
    const env = { ZAP_PAYER_MODE: "byok", ZAP_FAKE_LLM_FIXTURE: llm };
    const first = JSON.parse(runZap(root, ["deploy", "--agent", "--json"]));
    const lines = runZap(root, ["session", "--agent", "echo", "--json", "ping"], env).trim().split("\n").map((line) => JSON.parse(line));
    const started = lines.find((event) => event.type === "turn.started");

    const file = path.join(root, "agents/echo/agent.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("Do the work", "Do other work"));
    const second = JSON.parse(runZap(root, ["deploy", "--agent", "--json"]));
    expect(second.deploymentId).not.toBe(first.deploymentId);

    const sessions = JSON.parse(runZap(root, ["sessions", "ls", "--json"])).sessions;
    const meta = sessions.find((row: { id: string }) => row.id === started.sessionId);
    expect(meta.deploymentId).toBe(first.deploymentId);

    // the next turn on the pinned session still reports the original deployment
    const next = runZap(root, ["session", "--session", started.sessionId, "--json", "again"], env)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(next.find((event) => event.type === "turn.completed")).toBeTruthy();
    const after = JSON.parse(runZap(root, ["sessions", "ls", "--json"])).sessions.find(
      (row: { id: string }) => row.id === started.sessionId,
    );
    expect(after.deploymentId).toBe(first.deploymentId);
  });
});
