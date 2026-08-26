// CI-safe runtime eval (med): compose → up(fake) → ffmpeg plan → one
// plan-only turn against a recorded BYOK LLM fixture (matching the
// packages/runtime med-plan fixture) → down. Zero provider fetches, zero
// side-effecting executions, zero starts.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { makeRuntimeDir, prepareAgentsDir, repoRoot, runZap } from "./runtime-shared";

export default defineEval({
  description: "med runtime plans an ffmpeg lane and a recorded BYOK prompt turn plan-only, with zero spend and zero starts.",
  metadata: { weight: "med" },
  tags: ["ci", "runtime", "dry-run"],
  async test(t) {
    const root = makeRuntimeDir("med");
    const env = { ZAP_ALLOW_FAKE_SANDBOX: "1" };
    try {
      const composed = JSON.parse(runZap(root, ["compose", "Runtime.md", "--dry-run", "--json"], env));
      t.check(composed.entries, satisfies((entries) => Array.isArray(entries) && entries.length > 0, "compose resolves entries"));

      const up = JSON.parse(runZap(root, ["runtime", "up", "--json"], env));
      t.check(up.provider, equals("fake"));
      t.check(up.weight, equals("med"));

      const plan = JSON.parse(runZap(root, ["ffmpeg", "social-9x16", "in.mp4", "out.mp4", "--json"], env));
      t.check(plan.mode, equals("plan"));
      t.check(plan.executed, equals(false));

      // Plan-only prompt turn against a recorded BYOK LLM fixture; the tool
      // is planned (never executed), matching the med-plan runtime fixture.
      prepareAgentsDir(root);
      runZap(root, ["deploy", "--agent", "--json"], env);
      const llm = path.join(root, "llm.json");
      writeFileSync(llm, JSON.stringify([
        { text: "Planning the transcode.", toolCalls: [{ id: "1", name: "ffmpeg_transcode", input: { path: "/zap/fs/in.mp4" } }] },
        { text: "planned" },
      ]));
      const output = runZap(
        root,
        ["session", "--agent", "transcode", "--json", "transcode /zap/fs/in.mp4"],
        { ...env, ZAP_PAYER_MODE: "byok", ZAP_FAKE_LLM_FIXTURE: llm },
      );
      const events = output.trim().split("\n").map((line) => JSON.parse(line) as { type: string; tool?: string; live?: boolean });
      t.check(events[0]?.live, equals(false));
      const planned = events.filter((event) => event.type === "tool.planned").map((event) => event.tool);
      t.check(planned, equals(["ffmpeg_transcode"]));
      t.check(events.some((event) => event.type === "tool.call" || event.type === "tool.result"), equals(false));

      // Same plan-only event shape as the committed med-plan fixture.
      const fixture = readFileSync(path.join(repoRoot, "packages/runtime/tests/fixtures/med-plan.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { type: string });
      t.check(
        fixture.some((event) => event.type === "tool.planned") && !fixture.some((event) => event.type === "tool.call"),
        equals(true),
      );

      const down = JSON.parse(runZap(root, ["runtime", "down", up.id, "--json"], env));
      t.check(down.ok, equals(true));
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
});
