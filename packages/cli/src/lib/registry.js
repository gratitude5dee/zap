// @ts-check
/**
 * Command registry with directory auto-discovery.
 *
 * Registration API (for sessions adding command domains — memory, pay,
 * harness, agent, session, secret — without touching dispatcher files):
 * drop a `packages/cli/src/commands/<domain>/index.js` module that exports
 * a `command` object:
 *
 * ```js
 * // @ts-check
 * // typed as CliCommand from ../../lib/registry.js
 * export const command = {
 *   name: "pay",
 *   summary: "Payer status and managed-payer login",
 *   usage: "zap pay <status|login|logout> [--json]",
 *   run: async (ctx) => { ... },
 * };
 * ```
 *
 * The dispatcher discovers it automatically; `zap help`, `zap <name> --help`,
 * and `scripts/sync-cli-docs.mjs` pick it up with no dispatcher edits.
 * `ctx` is a {@link CommandContext}: positional args (command name removed),
 * parsed flags, and cwd. Commands must support `--json` (C28) and throw
 * `ZapCliError` for structured failures.
 */
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * @typedef {Object} CommandContext
 * @property {string[]} args positional arguments after the command name
 * @property {import("./args.js").CliFlags} flags parsed flags
 * @property {string} cwd working directory
 * @property {string[]} [argv] raw tokens after the command name (flags included)
 *
 * @typedef {Object} CliCommand
 * @property {string} name
 * @property {string} summary one-line help text
 * @property {string} usage usage string shown by `--help`
 * @property {string[]} [aliases]
 * @property {boolean} [hidden] exclude from `zap help` listing
 * @property {(ctx: CommandContext) => Promise<void> | void} run
 */

const commandsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "commands");

/**
 * Discovers every `commands/<domain>/index.js` module.
 * @returns {Promise<Map<string, CliCommand>>}
 */
export async function discoverCommands() {
  /** @type {Map<string, CliCommand>} */
  const registry = new Map();
  const entries = await fs.readdir(commandsDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const moduleFile = path.join(commandsDir, entry.name, "index.js");
    if (!existsSync(moduleFile)) continue;
    /** @type {{ command?: CliCommand, commands?: CliCommand[], default?: any, name?: string, help?: string, run?: Function }} */
    const mod = await import(pathToFileURL(moduleFile).href);
    for (const command of [mod.command, ...(mod.commands ?? []), adaptModule(mod)]) {
      if (!command) continue;
      registry.set(command.name, command);
      for (const alias of command.aliases ?? []) registry.set(alias, command);
    }
  }
  return registry;
}

/**
 * Adapts command modules that register via other supported conventions:
 * a default export shaped `{ name, description, run(argv, io) }` (raw argv,
 * io sink, numeric exit code) or module-level named exports
 * `{ name, help, run(args, flags) }`.
 * @param {{ command?: CliCommand, commands?: CliCommand[], default?: any, name?: string, help?: string, run?: Function }} mod
 * @returns {CliCommand | undefined}
 */
function adaptModule(mod) {
  if (mod.command || (mod.commands && mod.commands.length > 0)) return undefined;
  const legacy = mod.default;
  if (legacy && typeof legacy.name === "string" && typeof legacy.run === "function") {
    return {
      name: legacy.name,
      summary: String(legacy.description ?? legacy.summary ?? "").replace(/\.$/, ""),
      usage: legacy.usage ?? `zap ${legacy.name} <subcommand> [--json]`,
      run: async (ctx) => {
        const io = {
          env: process.env,
          error: (/** @type {string} */ message) => console.error(message),
          out: (/** @type {string} */ message) => console.log(message),
        };
        const code = await legacy.run(ctx.argv ?? ctx.args, io);
        if (typeof code === "number" && code !== 0) process.exitCode = code;
      },
    };
  }
  if (typeof mod.name === "string" && typeof mod.run === "function") {
    const run = mod.run;
    const firstLine = (mod.help ?? `zap ${mod.name}`).split("\n")[0];
    return {
      name: mod.name,
      summary: summaryFromUsage(firstLine),
      usage: firstLine,
      run: async (ctx) => {
        const code = await run(ctx.args, ctx.flags);
        if (typeof code === "number" && code !== 0) process.exitCode = code;
      },
    };
  }
  return undefined;
}

/**
 * @param {string} usage
 * @returns {string}
 */
function summaryFromUsage(usage) {
  const stripped = usage.replace(/^zap \S+\s*/, "");
  if (!stripped || stripped.startsWith("<") || stripped.startsWith("[")) return `Run \`${usage}\``;
  return stripped;
}

/**
 * @param {CliCommand} command
 * @returns {{ name: string, summary: string, usage: string, aliases: string[] }}
 */
export function commandHelp(command) {
  return {
    aliases: command.aliases ?? [],
    name: command.name,
    summary: command.summary,
    usage: command.usage,
  };
}
