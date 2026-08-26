// Agents-as-code dry-run eval (Z12): the canonical agents/transcode renders
// deterministically (matches the committed §12.9 fixture), then one plan-only
// turn against a recorded LLM fixture plans ffmpeg_transcode instead of
// executing it — zero sandbox.exec, zero provider fetches, and zero secret
// canaries in anything the run produces.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineEval } from "eve/evals";
import { equals, satisfies } from "eve/evals/expect";

const repoRoot = process.cwd();
const cli = path.join(repoRoot, "packages/cli/bin/zap.js");
const CANARY = "canary-agents-eval-9f3d2c1b";

function runZap(cwd: string, args: string[], env: Record<string, string> = {}, input?: string): string {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    input,
  });
}

function grepTree(root: string, needle: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      const stats = statSync(file);
      if (stats.isDirectory()) walk(file);
      else if (readFileSync(file, "latin1").includes(needle)) hits.push(file);
    }
  };
  walk(root);
  return hits;
}

export default defineEval({
  description: "agents/transcode renders deterministically and plans ffmpeg_transcode in a plan-only turn with no spend or canary leaks.",
  metadata: { agent: "transcode" },
  tags: ["ci", "agents", "dry-run"],
  async test(t) {
    // 1. Deterministic render: byte-for-byte fixture match (§12.9).
    const rendered = runZap(repoRoot, [
      "agent", "render", "--agent", "transcode", "--input", "transcode a.mp4", "--json",
    ]);
    const fixture = readFileSync(
      path.join(repoRoot, "packages/cli/tests/fixtures/agent-render.transcode.json"),
      "utf8",
    );
    t.log(`render bytes: ${rendered.length}`);
    t.check(rendered, equals(fixture));

    // 2. One plan-only turn against a recorded LLM fixture.
    const root = mkdtempSync(path.join(tmpdir(), "zap-agents-eval-"));
    try {
      symlinkSync(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
      cpSync(path.join(repoRoot, "agents"), path.join(root, "agents"), { recursive: true });
      cpSync(path.join(repoRoot, "project.ts"), path.join(root, "project.ts"));
      runZap(root, ["deploy", "--agent", "--json"]);
      runZap(
        root,
        ["secret", "set", "WEBHOOK_TOKEN", "--agent", "transcode", "--env", "development", "--stdin"],
        {},
        CANARY,
      );
      const llm = path.join(root, "llm.json");
      writeFileSync(llm, JSON.stringify([
        { text: "", toolCalls: [{ id: "1", name: "ffmpeg_transcode", input: { path: "/zap/fs/a.mp4" } }] },
        { text: "planned" },
      ]));
      const output = runZap(
        root,
        ["session", "--agent", "transcode", "--json", "transcode a.mp4"],
        { ZAP_PAYER_MODE: "byok", ZAP_FAKE_LLM_FIXTURE: llm },
      );
      const events = output.trim().split("\n").map((line) => JSON.parse(line) as { type: string; tool?: string; live?: boolean });
      t.log(`events: ${events.map((event) => event.type).join(",")}`);
      t.check(events[0]?.live, equals(false));
      const planned = events.filter((event) => event.type === "tool.planned").map((event) => event.tool);
      t.check(planned, equals(["ffmpeg_transcode"]));
      // zero sandbox.exec / provider spend: no tool.result and no tool.call events
      t.check(events.some((event) => event.type === "tool.result" || event.type === "tool.call"), equals(false));
      t.check(events[events.length - 1]?.type, equals("turn.completed"));

      // 3. Zero secret canaries in anything the run produced.
      t.check(output.includes(CANARY), equals(false));
      t.check(rendered.includes(CANARY), equals(false));
      const hits = grepTree(path.join(root, ".zap", "agentd"), CANARY);
      t.check(hits, satisfies((files) => Array.isArray(files) && files.length === 0, "no canary anywhere under the VM tree"));
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  },
});
