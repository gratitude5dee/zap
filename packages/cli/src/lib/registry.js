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
    /** @type {{ command?: CliCommand, commands?: CliCommand[] }} */
    const mod = await import(pathToFileURL(moduleFile).href);
    for (const command of [mod.command, ...(mod.commands ?? [])]) {
      if (!command) continue;
      registry.set(command.name, command);
      for (const alias of command.aliases ?? []) registry.set(alias, command);
    }
  }
  return registry;
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
