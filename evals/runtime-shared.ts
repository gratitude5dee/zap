// Shared helpers for the CI-safe runtime evals: compose → up(fake) → plan an
// ffmpeg lane → one plan-only recorded-LLM turn → down, with zero network.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const repoRoot = process.cwd();
const cli = path.join(repoRoot, "packages/cli/bin/zap.js");

export function runZap(cwd: string, args: string[], env: Record<string, string> = {}, input?: string): string {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
  });
}

export function makeRuntimeDir(weight: "light" | "med" | "heavy"): string {
  const root = mkdtempSync(path.join(tmpdir(), `zap-runtime-eval-${weight}-`));
  writeFileSync(
    path.join(root, "Runtime.md"),
    `---\nruntime: eval-${weight}\nversion: 1\nweight: ${weight}\nsandbox:\n  provider: fake\ngateway:\n  llm: openrouter\n  media: [fal]\n---\n# Eval runtime (${weight})\n`,
  );
  return root;
}

export function prepareAgentsDir(root: string): void {
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  cpSync(path.join(repoRoot, "agents"), path.join(root, "agents"), { recursive: true });
  cpSync(path.join(repoRoot, "project.ts"), path.join(root, "project.ts"));
}

export function grepTree(root: string, needle: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      const stats = statSync(file);
      if (stats.isDirectory()) walk(file);
      else if (readFileSync(file, "latin1").includes(needle)) hits.push(file);
    }
  };
  walk(root);
  return hits;
}
