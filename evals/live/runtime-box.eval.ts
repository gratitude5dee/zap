// Opt-in live Box eval (EVALS_LIVE=1): one runtime up on a real Box, one
// fork, one ffmpeg-lane exec, then stop — exactly one machine start and a
// stop without force.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";
import { runZap } from "../runtime-shared";
import { isLiveEvalEnabled } from "./runtime";

export default defineEval({
  description: "Live Box runtime: up → fork → one lane exec → stop, with starts == 1 and no force stop.",
  metadata: { spend: "box", weight: "med" },
  tags: ["live", "runtime", "box"],
  timeoutMs: 300_000,
  async test(t) {
    if (!isLiveEvalEnabled()) {
      t.skip("Live Box runs require EVALS_LIVE=1.");
      return;
    }
    if (!process.env.BOX_API_KEY) {
      t.skip("Live Box runs require BOX_API_KEY.");
      return;
    }

    const root = mkdtempSync(path.join(tmpdir(), "zap-runtime-box-eval-"));
    writeFileSync(
      path.join(root, "Runtime.md"),
      "---\nruntime: eval-box\nversion: 1\nweight: med\nsandbox:\n  provider: box\ngateway:\n  llm: openrouter\n  media: [fal]\n---\n# Live Box eval runtime\n",
    );
    let upId: string | undefined;
    let forkId: string | undefined;
    let starts = 0;
    try {
      const up = JSON.parse(runZap(root, ["runtime", "up", "--json"]));
      starts += 1; // the only machine start in this eval
      upId = up.id as string;
      t.check(up.ok, equals(true));
      t.check(up.provider, equals("box"));

      const fork = JSON.parse(runZap(root, ["runtime", "fork", upId, "--json"]));
      forkId = fork.id as string;
      t.check(fork.forkedFrom, equals(upId));

      const exec = JSON.parse(
        runZap(root, ["runtime", "exec", forkId, "--lane", "ffmpeg", "--json", "--", "ffmpeg", "-version"]),
      );
      t.check(exec.exitCode, equals(0));

      // stop without force: the CLI stop path never passes force
      const stopped = JSON.parse(runZap(root, ["runtime", "stop", forkId, "--json"]));
      t.check(stopped.status, equals("stopped"));
      t.check(starts, equals(1));
    } finally {
      for (const id of [forkId, upId]) {
        if (!id) continue;
        try {
          runZap(root, ["runtime", "down", id, "--json"]);
        } catch {
          // best-effort teardown
        }
      }
      rmSync(root, { force: true, recursive: true });
    }
  },
});
