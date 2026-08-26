// zap secret set/list/remove/sync (Z12, §5.12): values never printed, never
// on disk in plaintext, last4 only in listings, and a grep-proof canary.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const cli = path.resolve("packages/cli/bin/zap.js");
const repoRoot = path.resolve(".");
const CANARY = "canary-cli-secret-4f9a1b7e";

function runZap(cwd: string, args: string[], env: Record<string, string> = {}, input?: string) {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
  });
}

function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "zap-secret-"));
  symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  runZap(root, ["agent", "new", "echo", "--json"]);
  return root;
}

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { force: true, recursive: true });
});

describe("zap secret", () => {
  it("sets from stdin without ever printing the value and lists last4 only", () => {
    const root = makeProject();
    roots.push(root);
    const setOut = runZap(root, ["secret", "set", "WEBHOOK_TOKEN", "--agent", "echo", "--env", "development", "--stdin", "--json"], {}, CANARY);
    expect(setOut).not.toContain(CANARY);
    const parsed = JSON.parse(setOut);
    expect(parsed.ok).toBe(true);
    expect(parsed.secret.last4).toBe(CANARY.slice(-4));

    const listOut = runZap(root, ["secret", "list", "--json"]);
    expect(listOut).not.toContain(CANARY);
    const list = JSON.parse(listOut);
    expect(list.secrets).toEqual([
      { name: "WEBHOOK_TOKEN", agent: "echo", env: "development", last4: CANARY.slice(-4), persistEnv: false },
    ]);
  });

  it("stores the value encrypted in a 0600 file (no plaintext on disk)", () => {
    const root = makeProject();
    roots.push(root);
    runZap(root, ["secret", "set", "WEBHOOK_TOKEN", "--agent", "echo", "--env", "development", "--stdin"], {}, CANARY);
    const file = path.join(root, ".zap", "secrets.json");
    expect(readFileSync(file, "utf8")).not.toContain(CANARY);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("removes a scoped secret", () => {
    const root = makeProject();
    roots.push(root);
    runZap(root, ["secret", "set", "WEBHOOK_TOKEN", "--agent", "echo", "--env", "development", "--stdin"], {}, CANARY);
    const removed = JSON.parse(runZap(root, ["secret", "remove", "WEBHOOK_TOKEN", "--agent", "echo", "--env", "development", "--json"]));
    expect(removed).toEqual({ ok: true, removed: "WEBHOOK_TOKEN" });
    expect(JSON.parse(runZap(root, ["secret", "list", "--json"])).secrets).toEqual([]);
  });

  it("syncs names to the local runtime without leaking values in --json", () => {
    const root = makeProject();
    roots.push(root);
    runZap(root, ["secret", "set", "WEBHOOK_TOKEN", "--agent", "echo", "--env", "development", "--stdin"], {}, CANARY);
    const syncOut = runZap(root, ["secret", "sync", "--json"]);
    expect(syncOut).not.toContain(CANARY);
    const sync = JSON.parse(syncOut);
    expect(sync).toEqual({ ok: true, synced: ["WEBHOOK_TOKEN"], runtime: "local" });
  });

  it("never leaks the canary into deployment artifacts or session events", () => {
    const root = makeProject();
    roots.push(root);
    runZap(root, ["secret", "set", "WEBHOOK_TOKEN", "--agent", "echo", "--env", "development", "--stdin"], {}, CANARY);
    const deploy = JSON.parse(runZap(root, ["deploy", "--agent", "--json"]));
    const deploymentDir = path.join(root, ".zap/agentd/deployments", deploy.deploymentId);
    expect(readFileSync(path.join(deploymentDir, "manifest.json"), "utf8")).not.toContain(CANARY);
    expect(readFileSync(path.join(deploymentDir, "bundle.mjs"), "utf8")).not.toContain(CANARY);

    const llm = path.join(root, "llm.json");
    const env = { ZAP_PAYER_MODE: "byok", ZAP_FAKE_LLM_FIXTURE: llm };
    writeFileSync(llm, JSON.stringify([{ text: "ok" }]));
    const output = runZap(root, ["session", "--agent", "echo", "--json", "hello"], env);
    expect(output).not.toContain(CANARY);
  });
});
