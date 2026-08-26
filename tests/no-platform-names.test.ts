import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const { deny } = JSON.parse(
  readFileSync(path.join(repoRoot, "tests", "fixtures", "platform-name-denylist.json"), "utf8"),
) as { deny: string[] };

const SCAN_DIRS = ["packages", "agents", "docs"];
const SCAN_FILES = ["project.ts", "README.md", "CHANGELOG.md"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "fixtures"]);

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTENSIONS.has(path.extname(entry))) yield full;
  }
}

describe("no upstream platform names in shipped sources", () => {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    try {
      files.push(...walk(path.join(repoRoot, dir)));
    } catch {
      // optional dir
    }
  }
  for (const file of SCAN_FILES) {
    try {
      statSync(path.join(repoRoot, file));
      files.push(path.join(repoRoot, file));
    } catch {
      // optional file
    }
  }

  it("scans a non-empty file set", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("contains none of the denied names", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const name of deny) {
        if (text.includes(name)) offenders.push(`${path.relative(repoRoot, file)} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
