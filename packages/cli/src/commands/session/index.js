// @ts-check
/**
 * `zap session` — run a turn against a durable agent session (Z12, §5.12):
 *   zap session --agent <id>[@<alias>] [--session <id>] [--live] [--json] "..."
 * Plan-only is the default; `--live` is the only way to spend.
 * `--json` emits the agent event union as JSONL, one event per line.
 */
import { ZapCliError, usageError } from "../../lib/errors.js";
import { assertAgentsProject, createLocalAgentHost, parseAgentRef } from "../../lib/agents.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "session",
  summary: "Run a turn against a durable agent session (plan-only by default)",
  usage: 'zap session --agent <id>[@<alias>] [--session <id>] [--live] [--verbose|--json] "..."',
  async run(ctx) {
    await assertAgentsProject(ctx.cwd);
    // boolean flags followed by the positional message ("--json \"...\"")
    // are parsed as flag values; reclaim them as the message text.
    const parts = [...ctx.args];
    for (const flag of ["json", "live", "verbose"]) {
      const value = ctx.flags[flag];
      if (typeof value === "string") {
        parts.unshift(value);
        ctx.flags[flag] = true;
      }
    }
    const text = parts.join(" ").trim();
    const agentFlag = typeof ctx.flags.agent === "string" ? ctx.flags.agent : undefined;
    const sessionFlag = typeof ctx.flags.session === "string" ? ctx.flags.session : undefined;
    if (!agentFlag && !sessionFlag) throw usageError(command.usage ?? "");
    if (!text) throw usageError("zap session needs a message: the positional text is the turn input.");
    const live = ctx.flags.live === true;
    const { host } = await createLocalAgentHost(ctx.cwd);

    let meta;
    if (sessionFlag) {
      meta = await host.getSession(sessionFlag);
      if (!meta) {
        throw new ZapCliError({ code: "SESSION_NOT_FOUND", message: `Unknown session ${sessionFlag}.` });
      }
    } else {
      const ref = parseAgentRef(/** @type {string} */ (agentFlag));
      meta = await host.createSession({ agent: ref.agent, alias: ref.alias });
    }

    /** @type {string[]} */
    const finalText = [];
    for await (const event of host.turn(meta.id, { text, live, source: "cli" })) {
      if (ctx.flags.json) {
        console.log(JSON.stringify(event));
        if (event.type === "turn.failed") process.exitCode = 1;
        continue;
      }
      if (event.type === "turn.started") console.log(`session ${event.sessionId} turn ${event.turn} (${live ? "live" : "plan-only"})`);
      if (event.type === "tool.planned") console.log(`planned: ${event.tool}`);
      if (event.type === "tool.result" && ctx.flags.verbose) console.log(`tool: ${event.tool}`);
      if (event.type === "turn.completed" && event.text) finalText.push(event.text);
      if (event.type === "turn.failed") {
        throw new ZapCliError({
          code: event.code ?? "TURN_FAILED",
          message: `turn ${event.turn} failed: ${event.code}`,
          remediation: event.remediation,
        });
      }
    }
    if (!ctx.flags.json && finalText.length > 0) console.log(finalText.join("\n"));
  },
};
