import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

interface Snippet {
  file: string;
  line: number;
  code: string;
}

const IMPORT_RE = /from\s+["'](@wzrdtech\/[^"']+)["']/g;
const KNOWN_PACKAGES = new Set([
  "@wzrdtech/core",
  "@wzrdtech/providers",
  "@wzrdtech/agent",
  "@wzrdtech/zap",
  "@wzrdtech/zap-mcp",
  "@wzrdtech/zap-kernel",
  "@wzrdtech/zap-sandbox",
  "@wzrdtech/zap-memory",
  "@wzrdtech/zap-runtime",
  "@wzrdtech/zap-agent",
  "@wzrdtech/zap-templates",
  "@wzrdtech/zap-cloud",
]);

function* markdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* markdownFiles(full);
    else if (entry.endsWith(".md")) yield full;
  }
}

function extractTsSnippets(file: string): Snippet[] {
  const lines = readFileSync(file, "utf8").split("\n");
  const snippets: Snippet[] = [];
  let open: { line: number; buffer: string[] } | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (open) {
      if (line.trim() === "```") {
        snippets.push({ file, line: open.line, code: open.buffer.join("\n") });
        open = null;
      } else {
        open.buffer.push(line);
      }
    } else if (/^```(?:ts|typescript)\b/.test(line.trim())) {
      open = { line: i + 1, buffer: [] };
    }
  }
  return snippets;
}

describe("docs snippets", () => {
  const snippets: Snippet[] = [];
  for (const dir of ["docs", "packages"]) {
    try {
      for (const file of markdownFiles(path.join(repoRoot, dir))) snippets.push(...extractTsSnippets(file));
    } catch {
      // optional dir
    }
  }

  it("every @wzrdtech import in a ts snippet names a real package", () => {
    const offenders: string[] = [];
    for (const snippet of snippets) {
      for (const match of snippet.code.matchAll(IMPORT_RE)) {
        const specifier = match[1] ?? "";
        const parts = specifier.split("/");
        const pkg = parts.slice(0, 2).join("/");
        if (!KNOWN_PACKAGES.has(pkg)) {
          offenders.push(`${path.relative(repoRoot, snippet.file)}:${snippet.line} → ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ts snippets have balanced braces", () => {
    const offenders: string[] = [];
    for (const snippet of snippets) {
      const opens = (snippet.code.match(/\{/g) ?? []).length;
      const closes = (snippet.code.match(/\}/g) ?? []).length;
      if (opens !== closes) offenders.push(`${path.relative(repoRoot, snippet.file)}:${snippet.line}`);
    }
    expect(offenders).toEqual([]);
  });
});
