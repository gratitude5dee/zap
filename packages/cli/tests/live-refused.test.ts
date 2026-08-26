import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function runZapExpectFail(cwd: string, args: string[], env: Record<string, string> = {}) {
  try {
    execFileSync(process.execPath, [cli, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...env },
      stdio: "pipe",
    });
  } catch (error) {
    const failure = error as { status: number | null; stdout: string; stderr: string };
    return { exitCode: failure.status, stderr: failure.stderr, stdout: failure.stdout };
  }
  throw new Error(`expected zap ${args.join(" ")} to fail`);
}

/** A recipe whose only step is local, so a live run spends nothing. */
const localZapMd = `---
zap: local-only
version: 2
description: Local-only stitch recipe for payer-gate tests.
budget:
  cap_usd: 1
  estimate_usd: 0
inputs:
  SOURCE_URL:
    label: Source URL
    type: string
    required: true
output: Zap.mp4
steps:
  - id: stitch
    kind: stitch
    inputs: [SOURCE_URL]
    stitch:
      engine: auto
      format: mp4
      quality: standard
---

# Local Only
`;

function makeProject() {
  const root = mkdtempSync(path.join(tmpdir(), "zap-live-"));
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "t", private: true, type: "module" }));
  const skill = path.join(root, "agent", "skills", "zap-local-only");
  mkdirSync(skill, { recursive: true });
  writeFileSync(path.join(skill, "Zap.md"), localZapMd);
  return root;
}

describe("live spend is refused without a payer", () => {
  it("zap run --live exits 1 with PAYER_MISSING when the payer is missing", () => {
    const root = makeProject();
    try {
      const failure = runZapExpectFail(
        root,
        ["run", "local-only", "--input", "SOURCE_URL=https://example.com/a.mp4", "--live", "--json"],
        { ZAP_TEST_PAYER: "missing" },
      );
      expect(failure.exitCode).toBe(1);
      const payload = JSON.parse(failure.stdout);
      expect(payload.error.code).toBe("PAYER_MISSING");
      expect(payload.error.remediation).toEqual([
        "zap keys add <provider> …",
        "zap login --provider claude-code",
        "zap pay login --managed",
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("zap runtime exec --prompt refuses with PAYER_MISSING", () => {
    const root = makeProject();
    try {
      const failure = runZapExpectFail(root, ["runtime", "exec", "rt_x", "--prompt", "hi", "--json"], {
        ZAP_TEST_PAYER: "missing",
      });
      expect(failure.exitCode).toBe(1);
      expect(JSON.parse(failure.stdout).error.code).toBe("PAYER_MISSING");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("zap ffmpeg --live refuses with PAYER_MISSING", () => {
    const root = makeProject();
    try {
      const failure = runZapExpectFail(root, ["ffmpeg", "thumbnail", "in.mp4", "out.png", "--live", "--json"], {
        ZAP_TEST_PAYER: "missing",
      });
      expect(failure.exitCode).toBe(1);
      expect(JSON.parse(failure.stdout).error.code).toBe("PAYER_MISSING");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("passes the payer gate in byok mode (provider work mocked as a local step)", () => {
    const root = makeProject();
    try {
      const result = JSON.parse(
        runZap(root, ["run", "local-only", "--input", "SOURCE_URL=https://example.com/a.mp4", "--live", "--json"], {
          ZAP_TEST_PAYER: "byok",
        }),
      );
      expect(result.mode).toBe("live");
      expect(result.status).toBe("done");
      expect(result.zapUrl).toBe("https://example.com/a.mp4");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("plans by default even when a payer exists", () => {
    const root = makeProject();
    try {
      const result = JSON.parse(
        runZap(root, ["run", "local-only", "--input", "SOURCE_URL=https://example.com/a.mp4", "--json"], {
          ZAP_TEST_PAYER: "byok",
        }),
      );
      expect(result.mode).toBe("plan");
      expect(result.status).toBe("planned");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
