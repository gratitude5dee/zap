import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const cli = path.resolve("packages/cli/bin/zap.js");
const fixturesDir = path.resolve("packages/cli/tests/fixtures");

const runtimeMd = `---
runtime: demo
version: 1
weight: light
sandbox:
  provider: fake
---
# Demo
`;

let root: string;
let project: string;
let runId = "";

function runZap(args: string[], env: Record<string, string> = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: project,
    encoding: "utf8",
    env: { ...process.env, CONVEX_URL: "", NEXT_PUBLIC_CONVEX_URL: "", ...env },
  });
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "zap-fixtures-"));
  execFileSync(process.execPath, [cli, "init", "demo", "--non-interactive"], { cwd: root, encoding: "utf8" });
  project = path.join(root, "demo");
  writeFileSync(path.join(project, "Runtime.md"), runtimeMd);
  const run = JSON.parse(runZap(["run", "hello-world", "--input", "PROMPT=x", "--json"]));
  runId = run.runId;
});

afterAll(() => {
  rmSync(root, { force: true, recursive: true });
});

/** command name -> argv producing machine-readable JSON output */
const jsonCommands: Record<string, string[]> = {
  compose: ["compose", "--dry-run", "--json"],
  doctor: ["doctor", "--json"],
  embed: ["embed", "hello-world", "--json"],
  feedback: ["feedback", "great", "--json"],
  ffmpeg: ["ffmpeg", "thumbnail", "in.mp4", "out.png", "--json"],
  gallery: ["gallery", "--json"],
  info: ["info", "--json"],
  inspect: ["inspect", "hello-world", "--json"],
  keys: ["keys", "list", "--json"],
  lint: ["lint", "--json"],
  logout: ["logout", "--json"],
  mcp: ["mcp", "--json"],
  media: ["media", "ls", "--json"],
  new: ["new", "fixture-recipe", "--json"],
  run: ["run", "hello-world", "--input", "PROMPT=x", "--json"],
  runtime: ["runtime", "ps", "--json"],
  skills: ["skills", "check", "--json"],
  status: ["status", "--json"],
  telemetry: ["telemetry", "status", "--json"],
  template: ["template", "ls", "--json"],
  upgrade: ["upgrade", "--json"],
  validate: ["validate", "--json"],
};

describe("machine-readable command fixtures", () => {
  it("matches the committed top-level JSON shape for every command", { timeout: 120_000 }, () => {
    const expected = JSON.parse(readFileSync(path.join(fixturesDir, "json-shapes.json"), "utf8"));
    const actual: Record<string, string[]> = {};
    for (const [name, args] of Object.entries(jsonCommands)) {
      const argv = name === "status" ? ["status", runId, "--json"] : args;
      const output = JSON.parse(runZap(argv));
      actual[name] = Object.keys(output).sort();
    }
    expect(actual).toEqual(expected);
  });

  it("keeps zap compose --help stable", () => {
    const expected = readFileSync(path.join(fixturesDir, "compose-help.txt"), "utf8");
    expect(runZap(["compose", "--help"])).toBe(expected);
  });
});
