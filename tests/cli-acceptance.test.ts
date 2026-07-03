import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cli = path.resolve("packages/cli/bin/zap.js");

function runZap(cwd: string, args: string[]) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ZAP_PROVIDER: "mock" },
  });
}

describe("zap CLI acceptance", () => {
  it("initializes, validates, scaffolds, runs, and checks skills in a clean project", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zap-cli-"));
    try {
      runZap(root, ["init", "demo", "--non-interactive"]);
      const project = path.join(root, "demo");

      const validation = JSON.parse(runZap(project, ["validate", "--json"]));
      expect(validation.results).toHaveLength(1);
      expect(validation.results[0].zap).toBe("hello-world");

      const scaffold = JSON.parse(runZap(project, ["new", "my-test", "--json"]));
      expect(scaffold.slug).toBe("my-test");

      const run = JSON.parse(runZap(project, [
        "run",
        "my-test",
        "--input",
        "PROMPT=A bright launch bumper",
        "--json",
      ]));
      expect(run.mode).toBe("mock");
      expect(run.status).toBe("done");
      expect(run.zapUrl).toContain("mock://zap/my-test/");

      const status = JSON.parse(runZap(project, ["status", run.runId, "--json"]));
      expect(status.runId).toBe(run.runId);

      const skills = JSON.parse(runZap(project, ["skills", "check", "--json"]));
      expect(skills.ok).toBe(true);

      const docs = runZap(project, ["docs", "quickstart"]);
      expect(docs).toContain("npx @zap-md/cli init demo --non-interactive");

      expect(runZap(project, ["docs", "zap-spec"])).toContain("# Zap Spec");
      expect(runZap(project, ["docs", "steps"])).toContain("# Steps");
      expect(runZap(project, ["docs", "eve"])).toContain("# Eve");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
