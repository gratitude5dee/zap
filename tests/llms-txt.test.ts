// public/llms.txt must follow the Appendix C shape and link every template,
// provider, and agent docs page. Regenerate with scripts/generate-llms-txt.mjs.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");
const llms = readFileSync(path.join(repoRoot, "public", "llms.txt"), "utf8");

function pages(dir: string): string[] {
  return readdirSync(path.join(repoRoot, "docs", dir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""));
}

describe("public/llms.txt", () => {
  it("follows the Appendix C template sections", () => {
    for (const heading of [
      "# Zap — composable CPU agent runtime",
      "## For agents",
      "## Programming model",
      "## CLI",
      "## Agents as code",
      "## Runtime",
      "## Templates",
      "## Providers",
      "## Harnesses",
      "## Pay",
      "## Kernel and contracts",
    ]) {
      expect(llms).toContain(heading);
    }
  });

  it("links every template page", () => {
    for (const slug of pages("templates")) {
      expect(llms).toContain(`/docs/templates/${slug}`);
    }
  });

  it("links every provider page", () => {
    for (const slug of pages("providers")) {
      expect(llms).toContain(`/docs/providers/${slug}`);
    }
  });

  it("links every agent page", () => {
    for (const slug of pages("agents")) {
      expect(llms).toContain(`/docs/agents/${slug}`);
    }
  });

  it("links every harness page", () => {
    for (const slug of pages("harnesses")) {
      expect(llms).toContain(`/docs/harnesses/${slug}`);
    }
  });

  it("stays in sync with scripts/generate-llms-txt.mjs", async () => {
    const { execFileSync } = await import("node:child_process");
    execFileSync(process.execPath, [path.join(repoRoot, "scripts", "generate-llms-txt.mjs")], { cwd: repoRoot });
    const regenerated = readFileSync(path.join(repoRoot, "public", "llms.txt"), "utf8");
    expect(regenerated).toBe(llms);
  });
});
