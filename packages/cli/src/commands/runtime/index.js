// @ts-check
import { loadRuntimeSpecFromFile, resolveComposeTree, resolveRuntimeDefinition } from "../../lib/compose.js";
import { usageError, ZapCliError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { requirePayer } from "../../lib/payer.js";
import {
  findRuntime,
  peekHandle,
  reacquireHandle,
  readRuntimeState,
  sandboxServiceFor,
  takeHandle,
  trackHandle,
  writeRuntimeState,
} from "../../lib/runtimes.js";

const USAGE = "zap runtime <up|down|ps|logs|exec|snapshot|fork|stop|resume|desktop|import-sprite> [...] [--json]";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "runtime",
  summary: "Manage Zap runtimes (up, down, ps, logs, exec, snapshot, fork, stop, resume, desktop, import-sprite)",
  usage: USAGE,
  async run(ctx) {
    const [subcommand, ...rest] = ctx.args;
    const sub = { ...ctx, args: rest };
    switch (subcommand) {
      case "up": return runtimeUp(sub);
      case "down": return runtimeDown(sub);
      case "ps": return runtimePs(sub);
      case "logs": return runtimeLogs(sub);
      case "exec": return runtimeExec(sub);
      case "snapshot": return runtimeSnapshot(sub);
      case "fork": return runtimeFork(sub);
      case "stop": return runtimeStop(sub);
      case "resume": return runtimeResume(sub);
      case "desktop": return runtimeDesktop(sub);
      case "import-sprite": return runtimeImportSprite(sub);
      default:
        throw usageError(`Usage: ${USAGE}`);
    }
  },
};

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeUp({ args, flags }) {
  const file = resolveRuntimeDefinition(process.cwd(), args[0] ?? (flags.from === undefined ? undefined : String(flags.from)));
  const { spec } = await loadRuntimeSpecFromFile(file);
  const tree = resolveComposeTree(spec);
  const provider = tree.sandbox;
  const service = await sandboxServiceFor(provider);
  const runtimeId = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const idempotencyKey = `zap:runtime:${runtimeId}`;
  const handle = await service.acquire({
    idempotencyKey,
    provider: /** @type {import("@wzrdtech/zap-sandbox").SandboxProviderId} */ (provider),
    purpose: "runtime",
    size: spec.sandbox?.size,
    template: spec.sandbox?.template,
  });
  trackHandle(runtimeId, handle);
  const state = await readRuntimeState();
  state.runtimes.push({
    createdAt: new Date().toISOString(),
    id: runtimeId,
    idempotencyKey,
    lock: tree.lock,
    provider,
    runtime: tree.runtime,
    sandboxId: handle.id,
    status: "up",
    weight: tree.weight,
  });
  await writeRuntimeState(state);
  if (flags.json) printJson({ id: runtimeId, ok: true, provider, sandboxId: handle.id, weight: tree.weight });
  else console.log(`Runtime ${runtimeId} up (${provider}, ${tree.weight})`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeDown({ args, flags }) {
  const runtimeId = requireId(args);
  const state = await readRuntimeState();
  const record = findRuntime(state, runtimeId);
  const handle = takeHandle(runtimeId) ?? await reacquireHandle(record);
  takeHandle(runtimeId);
  await handle.release();
  state.runtimes = state.runtimes.filter((runtime) => runtime.id !== runtimeId);
  await writeRuntimeState(state);
  if (flags.json) printJson({ id: runtimeId, ok: true, status: "released" });
  else console.log(`Runtime ${runtimeId} released`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimePs({ flags }) {
  const state = await readRuntimeState();
  if (flags.json) printJson({ runtimes: state.runtimes });
  else state.runtimes.forEach((runtime) => console.log(`${runtime.id} ${runtime.status} ${runtime.provider} ${runtime.weight ?? ""}`.trim()));
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeLogs({ args, flags }) {
  const runtimeId = requireId(args);
  const state = await readRuntimeState();
  const record = findRuntime(state, runtimeId);
  const handle = await reacquireHandle(record);
  const result = await handle.exec(["journalctl", "--no-pager", "-n", String(flags.lines ?? 100)]);
  if (flags.json) printJson({ id: runtimeId, stderr: result.stderr, stdout: result.stdout });
  else console.log(result.stdout);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeExec({ args, flags }) {
  const runtimeId = requireId(args);
  if (flags.prompt !== undefined) await requirePayer("zap runtime exec --prompt");
  const argv = args.slice(1);
  if (argv.length === 0 && flags.prompt === undefined) throw usageError("Usage: zap runtime exec <id> -- <command...>");
  const state = await readRuntimeState();
  const record = findRuntime(state, runtimeId);
  const handle = await reacquireHandle(record);
  const result = await handle.exec(argv.length === 1 ? argv[0] : argv, flags.lane ? { lane: /** @type {import("@wzrdtech/zap-sandbox").LaneId} */ (String(flags.lane)) } : undefined);
  if (flags.json) printJson({ exitCode: result.exitCode, id: runtimeId, stderr: result.stderr, stdout: result.stdout });
  else {
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
  }
  if (result.exitCode !== 0) process.exitCode = 1;
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeSnapshot({ args, flags }) {
  const runtimeId = requireId(args);
  const state = await readRuntimeState();
  const record = findRuntime(state, runtimeId);
  const handle = await reacquireHandle(record);
  if (!handle.snapshot) throw unsupported("snapshot", record.provider);
  const ref = await handle.snapshot(args[1] ?? (flags.name === undefined ? undefined : String(flags.name)));
  if (flags.json) printJson({ id: runtimeId, ok: true, snapshot: ref });
  else console.log(`Snapshot ${ref.id} created`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeFork({ args, flags }) {
  const runtimeId = requireId(args);
  const state = await readRuntimeState();
  const record = findRuntime(state, runtimeId);
  const handle = await reacquireHandle(record);
  if (!handle.fork) throw unsupported("fork", record.provider);
  const forkId = `rt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const idempotencyKey = `zap:runtime:${forkId}`;
  const forked = await handle.fork({ idempotencyKey, purpose: "runtime" });
  trackHandle(forkId, forked);
  state.runtimes.push({ ...record, createdAt: new Date().toISOString(), forkedFrom: runtimeId, id: forkId, idempotencyKey, sandboxId: forked.id, status: "up" });
  await writeRuntimeState(state);
  if (flags.json) printJson({ forkedFrom: runtimeId, id: forkId, ok: true, sandboxId: forked.id });
  else console.log(`Runtime ${forkId} forked from ${runtimeId}`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeStop({ args, flags }) {
  const runtimeId = requireId(args);
  const state = await readRuntimeState();
  const record = findRuntime(state, runtimeId);
  const handle = await reacquireHandle(record);
  if (!handle.stop) throw unsupported("stop", record.provider);
  await handle.stop();
  record.status = "stopped";
  await writeRuntimeState(state);
  if (flags.json) printJson({ id: runtimeId, ok: true, status: "stopped" });
  else console.log(`Runtime ${runtimeId} stopped`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeResume({ args, flags }) {
  const runtimeId = requireId(args);
  const state = await readRuntimeState();
  const record = findRuntime(state, runtimeId);
  const handle = await reacquireHandle(record);
  if (!handle.resume) throw unsupported("resume", record.provider);
  await handle.resume();
  record.status = "up";
  await writeRuntimeState(state);
  if (flags.json) printJson({ id: runtimeId, ok: true, status: "up" });
  else console.log(`Runtime ${runtimeId} resumed`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeDesktop({ args, flags }) {
  const runtimeId = requireId(args);
  const state = await readRuntimeState();
  const record = findRuntime(state, runtimeId);
  const handle = peekHandle(runtimeId) ?? await reacquireHandle(record);
  if (!handle.desktop) throw unsupported("desktop", record.provider);
  const desktop = await handle.desktop({ vnc: Boolean(flags.vnc) });
  if (flags.json) printJson({ id: runtimeId, url: desktop.url });
  else console.log(desktop.url);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function runtimeImportSprite({ args, flags }) {
  const source = args[0];
  if (!source) throw usageError("Usage: zap runtime import-sprite <sprite-dir|manifest> [--json]");
  throw new ZapCliError({
    code: "SPRITE_UNSUPPORTED",
    message: `Sprite import (${source}) is not available in this build yet.`,
    remediation: "Sprite import lands with the template pipeline (Z4). Track runtime templates with zap template.",
  });
}

/** @param {string[]} args */
function requireId(args) {
  const runtimeId = args[0];
  if (!runtimeId) throw usageError(`Usage: ${USAGE}`);
  return runtimeId;
}

/**
 * @param {string} capability
 * @param {string} provider
 */
function unsupported(capability, provider) {
  return new ZapCliError({
    code: "SANDBOX_UNAVAILABLE",
    message: `Provider ${provider} does not support ${capability}.`,
  });
}
