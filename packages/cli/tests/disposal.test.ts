import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TRANSIENT = new Set(["CloseReq", "Immediate", "TickObject", "Timeout"]);

async function activeResources() {
  await new Promise((resolve) => setImmediate(resolve));
  return [...process.getActiveResourcesInfo()].filter((name) => !TRANSIENT.has(name)).sort();
}

const runtimeMd = `---
runtime: demo
version: 1
weight: light
sandbox:
  provider: fake
---
# Demo
`;

describe("zap runtime up/down disposal", () => {
  const previousCwd = process.cwd();
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "zap-disposal-"));
    writeFileSync(path.join(root, "Runtime.md"), runtimeMd);
    process.chdir(root);
    process.env.ZAP_ALLOW_FAKE_SANDBOX = "1";
  });

  afterEach(() => {
    process.chdir(previousCwd);
    delete process.env.ZAP_ALLOW_FAKE_SANDBOX;
    rmSync(root, { force: true, recursive: true });
  });

  it("returns active resources to the pre-up baseline after runtime down", async () => {
    const { command } = await import("../src/commands/runtime/index.js");
    const { readRuntimeState } = await import("../src/lib/runtimes.js");

    const baseline = await activeResources();

    await command.run({ args: ["up"], cwd: root, flags: { json: true } });
    const state = await readRuntimeState(root);
    expect(state.runtimes).toHaveLength(1);
    const runtimeId = state.runtimes[0].id as string;

    await command.run({ args: ["down", runtimeId], cwd: root, flags: { json: true } });
    const after = await readRuntimeState(root);
    expect(after.runtimes).toHaveLength(0);

    expect(await activeResources()).toEqual(baseline);
  });
});
