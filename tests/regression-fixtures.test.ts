import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeCliJson } from "./helpers/normalize-cli-json.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(repoRoot, "packages", "cli", "bin", "zap.js");
const recipe = path.join(repoRoot, "agent", "skills", "zap-world-cup-entrance", "Zap.md");
const fixturesDir = path.join(repoRoot, "tests", "fixtures", "regression");

const cases: Array<{ name: string; args: string[] }> = [
  { name: "validate", args: ["validate", recipe, "--json"] },
  { name: "run-plan", args: ["run", recipe, "--json"] },
  { name: "inspect", args: ["inspect", recipe, "--json"] },
  { name: "gallery", args: ["gallery", "--json"] },
];

function runCli(args: string[]): string {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("regression fixtures (frozen 0.3.1 outputs)", () => {
  for (const testCase of cases) {
    it(`\`zap ${testCase.args.join(" ")}\` matches tests/fixtures/regression/${testCase.name}.json`, () => {
      const fixture = readFileSync(path.join(fixturesDir, `${testCase.name}.json`), "utf8");
      const actual = normalizeCliJson(runCli(testCase.args));
      expect(JSON.parse(actual)).toEqual(JSON.parse(fixture));
    });
  }
});
