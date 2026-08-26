import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cli = path.resolve("packages/cli/bin/zap.js");

function runZap(cwd: string, args: string[], env: Record<string, string> = {}) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runZapExpectFail(cwd: string, args: string[]) {
  try {
    execFileSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    const failure = error as { status: number | null; stdout: string; stderr: string };
    return { exitCode: failure.status, stderr: failure.stderr, stdout: failure.stdout };
  }
  throw new Error(`expected zap ${args.join(" ")} to fail`);
}

const runtimeMd = `---
runtime: demo
version: 1
weight: med
sandbox:
  provider: fake
gateway:
  llm: openrouter
  media: [fal]
---
# Demo runtime
`;

const zapConfigTs = `export default {
  runtime: "demo",
  version: 1,
  weight: "med",
  sandbox: { provider: "fake" },
  gateway: { llm: "openrouter", media: ["fal"] },
};
`;

describe("zap compose", () => {
  it("produces identical trees for equivalent Runtime.md and zap.config.ts", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zap-compose-"));
    try {
      writeFileSync(path.join(root, "Runtime.md"), runtimeMd);
      writeFileSync(path.join(root, "zap.config.ts"), zapConfigTs);
      const fromMd = JSON.parse(runZap(root, ["compose", "Runtime.md", "--dry-run", "--json"]));
      const fromTs = JSON.parse(runZap(root, ["compose", "zap.config.ts", "--dry-run", "--json"]));
      expect(fromMd.source).toBe("runtime-md");
      expect(fromTs.source).toBe("zap-config");
      expect(fromMd.entries).toEqual(fromTs.entries);
      expect(fromMd.lock).toBe(fromTs.lock);
      expect(fromMd.entries.every((entry: { entryId: string }) => /#[0-9a-f]{8}$/.test(entry.entryId))).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects an invalid weight with a structured error", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zap-compose-"));
    try {
      writeFileSync(path.join(root, "Runtime.md"), runtimeMd.replace("weight: med", "weight: enormous"));
      const failure = runZapExpectFail(root, ["compose", "--dry-run", "--json"]);
      expect(failure.exitCode).toBe(1);
      const payload = JSON.parse(failure.stdout);
      expect(payload.error.code).toBe("SCHEMA_INVALID");
      expect(payload.error.remediation).toContain("light, med, or heavy");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("rejects an unsupported sandbox provider with alternatives", () => {
    const root = mkdtempSync(path.join(tmpdir(), "zap-compose-"));
    try {
      writeFileSync(path.join(root, "Runtime.md"), runtimeMd.replace("provider: fake", "provider: mystery-cloud"));
      const failure = runZapExpectFail(root, ["compose", "--dry-run", "--json"]);
      expect(failure.exitCode).toBe(1);
      const payload = JSON.parse(failure.stdout);
      expect(payload.error.code).toBe("PROVIDER_UNSUPPORTED");
      expect(payload.error.alternatives).toContain("box");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("never calls acquire on --dry-run", async () => {
    const { fakeSandboxService } = await import("@wzrdtech/zap-runtime/testing");
    const service = fakeSandboxService();
    let acquires = 0;
    const originalAcquire = service.acquire.bind(service);
    service.acquire = async (spec) => {
      acquires += 1;
      return originalAcquire(spec);
    };
    const { loadRuntimeSpecFromFile, resolveComposeTree } = await import("../src/lib/compose.js");
    const root = mkdtempSync(path.join(tmpdir(), "zap-compose-"));
    try {
      writeFileSync(path.join(root, "Runtime.md"), runtimeMd);
      const { spec } = await loadRuntimeSpecFromFile(path.join(root, "Runtime.md"));
      const tree = resolveComposeTree(spec);
      expect(tree.entries.length).toBeGreaterThan(0);
      expect(acquires).toBe(0);

      const output = JSON.parse(runZap(root, ["compose", "--dry-run", "--json"], { ZAP_ALLOW_FAKE_SANDBOX: "1" }));
      expect(output.dryRun).toBe(true);
      expect(output.quote.mode).toBe("plan");
      expect(acquires).toBe(0);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
