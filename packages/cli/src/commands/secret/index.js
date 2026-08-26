// @ts-check
/**
 * `zap secret` — write-only agent secrets (Z12, §5.12):
 *   zap secret set NAME --agent <id> --env <alias> [--stdin] [--persist-env]
 *   zap secret list [--json]        names, scopes, and last4 only
 *   zap secret remove NAME --agent <id> --env <alias>
 *   zap secret sync [--runtime <id>]
 * Values are never printed, never written to a template or a --json payload.
 */
import { usageError, ZapCliError } from "../../lib/errors.js";
import { printJson } from "../../lib/output.js";
import { describeSecret, findSecretIndex, makeSecretEntry, readSecretStore, secretValue, writeSecretStore } from "../../lib/secrets-store.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "secret",
  summary: "Set, list, remove, and sync write-only agent secrets",
  usage: "zap secret <set|list|remove|sync> [NAME] [--agent <id>] [--env <alias>] [--stdin] [--json]",
  async run(ctx) {
    const [sub, ...rest] = ctx.args;
    const next = { ...ctx, args: rest };
    if (sub === "set") return secretSet(next);
    if (sub === "list" || sub === "ls") return secretList(next);
    if (sub === "remove" || sub === "rm") return secretRemove(next);
    if (sub === "sync") return secretSync(next);
    throw usageError(`Unknown secret subcommand "${sub ?? ""}". Try: set, list, remove, sync.`);
  },
};

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function secretSet(ctx) {
  const name = ctx.args[0];
  if (!name) throw usageError("Usage: zap secret set NAME --agent <id> --env <alias> [--stdin]");
  const agent = typeof ctx.flags.agent === "string" ? ctx.flags.agent : undefined;
  const env = typeof ctx.flags.env === "string" ? ctx.flags.env : undefined;
  const value = await readSecretValue(ctx);
  if (!value) {
    throw new ZapCliError({
      code: "SECRET_VALUE_MISSING",
      message: "No secret value. Pipe it on stdin (--stdin) or set ZAP_SECRET_VALUE.",
    });
  }
  const store = await readSecretStore(ctx.cwd);
  const entry = makeSecretEntry({ name, agent, env, value, persistEnv: ctx.flags.persistEnv === true });
  const index = findSecretIndex(store, { name, agent, env });
  if (index === -1) store.secrets.push(entry);
  else store.secrets[index] = entry;
  await writeSecretStore(ctx.cwd, store);
  if (ctx.flags.json) printJson({ ok: true, secret: describeSecret(entry) });
  else console.log(`Set ${name} for ${agent ?? "*"}@${env ?? "*"} (…${entry.last4}).`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function secretList(ctx) {
  const store = await readSecretStore(ctx.cwd);
  const secrets = store.secrets.map(describeSecret);
  if (ctx.flags.json) printJson({ secrets });
  else if (secrets.length === 0) console.log("No secrets set.");
  else for (const secret of secrets) console.log(`${secret.name} agent=${secret.agent} env=${secret.env} …${secret.last4}`);
}

/** @param {import("../../lib/registry.js").CommandContext} ctx */
async function secretRemove(ctx) {
  const name = ctx.args[0];
  if (!name) throw usageError("Usage: zap secret remove NAME --agent <id> --env <alias>");
  const agent = typeof ctx.flags.agent === "string" ? ctx.flags.agent : undefined;
  const env = typeof ctx.flags.env === "string" ? ctx.flags.env : undefined;
  const store = await readSecretStore(ctx.cwd);
  const index = findSecretIndex(store, { name, agent, env });
  if (index === -1) {
    throw new ZapCliError({ code: "SECRET_NOT_FOUND", message: `No secret ${name} for ${agent ?? "*"}@${env ?? "*"}.` });
  }
  store.secrets.splice(index, 1);
  await writeSecretStore(ctx.cwd, store);
  if (ctx.flags.json) printJson({ ok: true, removed: name });
  else console.log(`Removed ${name}.`);
}

/**
 * Syncs stored secret names/values into the local agentd resolver memory by
 * touching the store's mtime; the in-process host re-reads the store on
 * startup. With a hosted runtime this POSTs /v1/agents/secrets/sync.
 * @param {import("../../lib/registry.js").CommandContext} ctx
 */
async function secretSync(ctx) {
  const store = await readSecretStore(ctx.cwd);
  const names = store.secrets.map((entry) => entry.name);
  const runtimeUrl = typeof ctx.flags.runtime === "string" ? ctx.flags.runtime : process.env.ZAP_AGENTD_URL;
  if (runtimeUrl) {
    /** @type {Record<string, string>} */
    const values = {};
    for (const entry of store.secrets) values[entry.name] = secretValue(entry);
    const response = await fetch(new URL("/v1/agents/secrets/sync", runtimeUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    });
    if (!response.ok) {
      throw new ZapCliError({ code: "SECRET_SYNC_FAILED", message: `runtime rejected secret sync (${response.status}).` });
    }
  }
  if (ctx.flags.json) printJson({ ok: true, synced: names, runtime: runtimeUrl ?? "local" });
  else console.log(`Synced ${names.length} secret(s) to ${runtimeUrl ?? "the local runtime"}.`);
}

/**
 * Reads the secret value from stdin (with --stdin or a piped stdin) or the
 * ZAP_SECRET_VALUE environment variable. Never from argv (shell history).
 * @param {import("../../lib/registry.js").CommandContext} ctx
 */
async function readSecretValue(ctx) {
  if (process.env.ZAP_SECRET_VALUE) return process.env.ZAP_SECRET_VALUE;
  if (ctx.flags.stdin === true || !process.stdin.isTTY) {
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data.trim();
  }
  return "";
}
