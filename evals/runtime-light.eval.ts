// CI-safe runtime eval (light): compose → up on the fake sandbox → plan an
// ffmpeg preset → down. Zero provider fetches, zero side-effecting
// executions, zero real machine starts.
import { rmSync } from "node:fs";
import path from "node:path";
import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { makeRuntimeDir, runZap } from "./runtime-shared";

export default defineEval({
  description: "zap compose/up/exec-plan/down on a light fake-sandbox runtime is fully plan-only with zero starts.",
  metadata: { weight: "light" },
  tags: ["ci", "runtime", "dry-run"],
  async test(t) {
    const root = makeRuntimeDir("light");
    const env = { ZAP_ALLOW_FAKE_SANDBOX: "1" };
    try {
      const composed = JSON.parse(runZap(root, ["compose", "Runtime.md", "--dry-run", "--json"], env));
      t.check(composed.source, equals("runtime-md"));
      t.check(composed.entries, satisfies((entries) => Array.isArray(entries) && entries.length > 0, "compose resolves entries"));

      const up = JSON.parse(runZap(root, ["runtime", "up", "--json"], env));
      t.check(up.ok, equals(true));
      t.check(up.provider, equals("fake"));

      const exec = JSON.parse(runZap(root, ["runtime", "exec", up.id, "--json", "--", "echo", "ready"], env));
      t.check(exec.exitCode, equals(0));

      const plan = JSON.parse(runZap(root, ["ffmpeg", "gif", "in.mp4", "out.gif", "--json"], env));
      t.check(plan.mode, equals("plan"));
      t.check(plan.executed, equals(false));

      const down = JSON.parse(runZap(root, ["runtime", "down", up.id, "--json"], env));
      t.check(down.ok, equals(true));
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
});
