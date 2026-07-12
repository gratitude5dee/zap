import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { GET } from "../app/api/zaps/route";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(repoRoot, "packages/cli/bin/zap.js");
const generator = path.join(repoRoot, "scripts/generate-zap-index.mjs");
const indexPath = path.join(repoRoot, "registry/zaps/index.json");

type RegistryEntry = {
  budget: { cap_usd: number; estimate_usd: number };
  description: string;
  inputs: Record<string, unknown>;
  providers: string[];
  slug: string;
  tags: string[];
};

describe("canonical Zap registry index", () => {
  it("is generated without drift from registry Zap.md files", () => {
    const check = runGenerator(["--check"]);
    expect(check.status, check.stderr || check.stdout).toBe(0);

    const index = JSON.parse(readFileSync(indexPath, "utf8")) as { version: number; zaps: RegistryEntry[] };
    expect(index.version).toBe(1);
    expect(index.zaps.map((zap) => zap.slug)).toEqual(["caught-by-the-cam", "world-cup-entrance"]);

    const cup = index.zaps.find((zap) => zap.slug === "world-cup-entrance");
    expect(cup?.providers).toEqual(["fal", "gmi"]);
    expect(cup?.tags).toContain("cup");
    expect(cup?.inputs).toHaveProperty("NAME");
    expect(cup?.budget.cap_usd).toBe(15);
  });

  it("detects a stale generated index", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zap-registry-"));
    try {
      mkdirSync(path.join(root, "registry"), { recursive: true });
      cpSync(path.join(repoRoot, "registry/zaps"), path.join(root, "registry/zaps"), { recursive: true });
      writeFileSync(path.join(root, "registry/zaps/index.json"), '{"version":1,"zaps":[]}\n');

      const check = runGenerator(["--check", "--root", root]);
      expect(check.status).toBe(1);
      expect(check.stderr || check.stdout).toMatch(/out of date/i);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("filters the public API from the canonical index", async () => {
    const getWithRequest = GET as unknown as (request: Request) => Promise<Response>;
    const response = await getWithRequest(new Request("https://zap.wzrd.tech/api/zaps?query=cup"));
    const payload = await response.json() as { query: string; zaps: RegistryEntry[] };

    expect(response.status).toBe(200);
    expect(payload.query).toBe("cup");
    expect(payload.zaps.map((zap) => zap.slug)).toEqual(["world-cup-entrance"]);
  });

  it("finds canonical templates with local-first CLI search", () => {
    const result = spawnSync(process.execPath, [cli, "search", "cup"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, CONVEX_URL: "", NEXT_PUBLIC_CONVEX_URL: "" },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("zap-world-cup-entrance");
    expect(result.stdout).not.toContain("zap-caught-by-the-cam");
  });

  it("exposes generate and check package scripts", () => {
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    expect(packageJson.scripts["registry:generate"]).toMatch(/generate-zap-index/);
    expect(packageJson.scripts["registry:check"]).toMatch(/generate-zap-index.*--check/);
  });
});

function runGenerator(args: string[]) {
  return spawnSync(process.execPath, [generator, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}
