// Z11 hardening: no secret value may exist anywhere a template, manifest, or
// snapshot bake input lives (C6/C15/C18). Mirrors infra/box/secret-sweep.sh in
// process and also runs the script itself over packages/templates.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bsk-ant-[A-Za-z0-9_-]{16,}\b/,
  /\bxai-[A-Za-z0-9_-]{16,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bbox_[A-Za-z0-9]{20,}\b/,
  /\btw_secret_[A-Za-z0-9_-]{16,}\b/,
  /\bcdp_[A-Za-z0-9_-]{16,}\b/,
  /\bmpp_[A-Za-z0-9_-]{16,}\b/,
  /\brt_(?:live|secret)_[A-Za-z0-9_-]{16,}\b/,
  /RUNTIME_TOKEN=[^\s"']{8,}/,
  /(?:OPENAI|ANTHROPIC|DEEPSEEK|XAI|MOONSHOT)_API_KEY=[^\s"']{8,}/,
  /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/,
];

const SKIP = new Set(["node_modules", "dist", ".next"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".sh", ".service", ".yml", ".yaml", ".toml", ".txt", ".env", ""]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (TEXT_EXT.has(path.extname(entry))) yield full;
  }
}

function sweep(root: string): string[] {
  const hits: string[] = [];
  for (const file of walk(root)) {
    // the sweep script itself carries the pattern text, not secret values
    if (path.basename(file) === "secret-sweep.sh") continue;
    const text = readFileSync(file, "latin1");
    for (const pattern of SECRET_PATTERNS) {
      // Report file + pattern id only — never echo the matched value.
      if (pattern.test(text)) hits.push(`${path.relative(repoRoot, file)} → ${pattern.source.slice(0, 24)}`);
    }
  }
  return hits;
}

describe("secret sweep (C6/C15): templates, agents, skills, infra carry no secret values", () => {
  for (const target of ["packages/templates", "agents", "skills", "infra"]) {
    it(`${target} has zero hits`, () => {
      expect(sweep(path.join(repoRoot, target))).toEqual([]);
    });
  }

  it("infra/box/secret-sweep.sh exits 0 over packages/templates", () => {
    const out = execFileSync("bash", [path.join(repoRoot, "infra/box/secret-sweep.sh"), "packages/templates"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(out).not.toContain("HIT");
  });

  it("no committed template env file exists (per-box env is tenant-only, C6)", () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(repoRoot, "packages/templates"))) {
      const base = path.basename(file);
      if (base === ".env" || (base.startsWith(".env.") && base !== ".env.example")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
