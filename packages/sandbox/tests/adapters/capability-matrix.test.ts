import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const script = path.join(repoRoot, "scripts", "generate-capability-matrix.mjs");

describe("capability matrix", () => {
  it("docs/isolation.md matches the generated matrix (drift fails)", { timeout: 120_000 }, async () => {
    const { stdout } = await execFileAsync(process.execPath, [script, "--check"], { cwd: repoRoot });
    expect(stdout).toContain("capability matrix: no drift");
  });
});
