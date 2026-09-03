import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(repoRoot, "packages/cli/bin/zap.js");
const cliPackage = path.join(repoRoot, "packages/cli");
const bundledRegistry = path.join(cliPackage, "resources/registry/zaps");
const commerceRecipes = ["zap-merch-drop", "zap-event-ticket"] as const;

type PlanOutput = {
  live: boolean;
  status: string;
  steps: Array<{ kind: string; quoteUsd: number; wouldStage?: { charges: boolean; kind: string } }>;
  zap: string;
};

function runCli(args: string[], cwd: string) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      HOME: cwd,
      NODE_ENV: "test",
      PATH: process.env.PATH ?? "",
    },
  });
}

describe("bundled commerce recipes", () => {
  it("mirrors agent/skills into the canonical and bundled registries", () => {
    for (const recipe of commerceRecipes) {
      for (const file of ["Zap.md", "SKILL.md"]) {
        const source = readFileSync(path.join(repoRoot, "agent/skills", recipe, file), "utf8");
        expect(readFileSync(path.join(repoRoot, "registry/zaps", recipe, file), "utf8")).toBe(source);
        expect(readFileSync(path.join(bundledRegistry, recipe, file), "utf8")).toBe(source);
      }
      expect(existsSync(path.join(bundledRegistry, recipe, "prompts"))).toBe(true);
    }
  });

  it("ships the recipe files in the published @wzrdtech/zap tarball", () => {
    const pack = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: cliPackage,
      encoding: "utf8",
    });
    expect(pack.status, pack.stderr).toBe(0);
    const [manifest] = JSON.parse(pack.stdout) as Array<{ files: Array<{ path: string }> }>;
    const files = new Set(manifest.files.map((file) => file.path));
    expect(files.has("resources/registry/zaps/index.json")).toBe(true);
    expect(files.has("resources/registry/zaps/zap-merch-drop/Zap.md")).toBe(true);
    expect(files.has("resources/registry/zaps/zap-merch-drop/SKILL.md")).toBe(true);
    expect(files.has("resources/registry/zaps/zap-merch-drop/prompts/product-art.md")).toBe(true);
    expect(files.has("resources/registry/zaps/zap-event-ticket/Zap.md")).toBe(true);
    expect(files.has("resources/registry/zaps/zap-event-ticket/SKILL.md")).toBe(true);
    expect(files.has("resources/registry/zaps/zap-event-ticket/prompts/poster.md")).toBe(true);
  }, 60_000);

  it.each(["merch-drop", "event-ticket"])("plans %s from an empty directory with no credentials", (slug) => {
    const cwd = mkdtempSync(path.join(tmpdir(), "zap-empty-"));
    try {
      const result = runCli(["run", slug, "--json"], cwd);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const plan = JSON.parse(result.stdout) as PlanOutput;
      expect(plan.zap).toBe(slug);
      expect(plan.live).toBe(false);
      expect(plan.status).toBe("planned");
      const commerce = plan.steps.find((step) => step.kind === "commerce.stage_listing");
      expect(commerce?.quoteUsd).toBe(0);
      expect(commerce?.wouldStage?.charges).toBe(false);
      expect(existsSync(path.join(cwd, "agent"))).toBe(false);
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  }, 60_000);

  it("prefers a project-local recipe over the bundled one", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "zap-local-"));
    try {
      const local = path.join(cwd, "agent/skills/zap-merch-drop");
      mkdirSync(path.dirname(local), { recursive: true });
      cpSync(path.join(repoRoot, "agent/skills/zap-merch-drop"), local, { recursive: true });
      const zapMd = path.join(local, "Zap.md");
      writeFileSync(zapMd, readFileSync(zapMd, "utf8").replace(/^  cap_usd: .*$/m, "  cap_usd: 0.42"));

      const result = runCli(["inspect", "merch-drop", "--json"], cwd);
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toContain("0.42");
    } finally {
      rmSync(cwd, { force: true, recursive: true });
    }
  }, 60_000);
});
