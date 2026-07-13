import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cli = path.resolve("packages/cli/bin/zap.js");
const cliVersion = "0.3.1";

function runZap(cwd: string, args: string[]) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CONVEX_URL: "", NEXT_PUBLIC_CONVEX_URL: "" },
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
      expect(run.mode).toBe("plan");
      expect(run.status).toBe("planned");
      expect(run.zapUrl).toBeUndefined();

      const status = JSON.parse(runZap(project, ["status", run.runId, "--json"]));
      expect(status.runId).toBe(run.runId);

      const improve = JSON.parse(runZap(project, ["improve", "my-test", "--json"]));
      expect(improve.evidence.sources.localRuns).toBeGreaterThanOrEqual(1);

      const skills = JSON.parse(runZap(project, ["skills", "check", "--json"]));
      expect(skills.ok).toBe(true);

      const docs = runZap(project, ["docs", "quickstart"]);
      expect(docs).toContain(`npx @wzrdtech/zap@${cliVersion} init demo --non-interactive`);

      const help = runZap(project, ["help"]);
      expect(help).toContain("npm exec -- zap <command>");
      expect(help).toContain("Node 24.x");

      expect(runZap(project, ["docs", "zap-spec"])).toContain("# Zap Spec");
      expect(runZap(project, ["docs", "steps"])).toContain("# Steps");
      expect(runZap(project, ["docs", "eve"])).toContain("# Eve");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
