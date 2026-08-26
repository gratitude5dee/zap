// CI-safe runtime eval (heavy): compose → up(fake) → ffmpeg plan → down,
// then a canary sweep across everything the run produced. Zero provider
// fetches, zero side-effecting executions, zero starts.
import { rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { grepTree, makeRuntimeDir, runZap } from "./runtime-shared";

const CANARY = "canary-runtime-heavy-4c1a9e77";

export default defineEval({
  description: "heavy runtime composes and plans on the fake sandbox with zero spend, zero starts, and no canary leaks.",
  metadata: { weight: "heavy" },
  tags: ["ci", "runtime", "dry-run"],
  async test(t) {
    const root = makeRuntimeDir("heavy");
    const env = { ZAP_ALLOW_FAKE_SANDBOX: "1", ZAP_EVAL_CANARY: CANARY };
    try {
      const composed = JSON.parse(runZap(root, ["compose", "Runtime.md", "--dry-run", "--json"], env));
      t.check(composed.entries, satisfies((entries) => Array.isArray(entries) && entries.length > 0, "compose resolves entries"));
      t.check(JSON.stringify(composed).includes(CANARY), equals(false));

      const up = JSON.parse(runZap(root, ["runtime", "up", "--json"], env));
      t.check(up.provider, equals("fake"));
      t.check(up.weight, equals("heavy"));

      const exec = JSON.parse(runZap(root, ["runtime", "exec", up.id, "--json", "--", "echo", "ready"], env));
      t.check(exec.exitCode, equals(0));

      const plan = JSON.parse(runZap(root, ["ffmpeg", "extract-audio", "in.mp4", "out.m4a", "--json"], env));
      t.check(plan.mode, equals("plan"));
      t.check(plan.executed, equals(false));

      const down = JSON.parse(runZap(root, ["runtime", "down", up.id, "--json"], env));
      t.check(down.ok, equals(true));

      // nothing the run produced carries the env canary
      const hits = grepTree(root, CANARY).filter((file) => !file.endsWith("llm.json"));
      t.check(hits, satisfies((files) => Array.isArray(files) && files.length === 0, "no canary in any produced artifact"));
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
});
