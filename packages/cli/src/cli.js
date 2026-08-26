// @ts-check
/**
 * Zap CLI dispatcher.
 *
 * Commands live in `src/commands/<domain>/index.js` and are discovered
 * automatically — see `src/lib/registry.js` for the registration API that
 * lets new command domains (memory, pay, harness, agent, session, secret)
 * plug in without editing this file.
 */
import { parseArgs } from "./lib/args.js";
import { exitCodeFor, usageError } from "./lib/errors.js";
import { printCommandError } from "./lib/output.js";
import { loadDotEnv, version } from "./lib/project.js";
import { discoverCommands } from "./lib/registry.js";

async function main(argv) {
  loadDotEnv(process.cwd());
  const { args, flags } = parseArgs(argv);
  const commandName = args[0];

  if (flags.version || commandName === "--version" || commandName === "-v") {
    console.log(version);
    return;
  }

  const registry = await discoverCommands();

  if (!commandName || commandName === "help" || (flags.help && !commandName)) {
    printHelp(registry);
    return;
  }

  const command = registry.get(commandName);
  if (!command) {
    throw usageError(`Unknown command "${commandName}". Run zap help.`);
  }
  if (flags.help) {
    console.log(command.usage);
    return;
  }
  await command.run({ args: args.slice(1), cwd: process.cwd(), flags });
}

/** @param {Map<string, import("./lib/registry.js").CliCommand>} registry */
function printHelp(registry) {
  const seen = new Set();
  const lines = [];
  for (const command of registry.values()) {
    if (seen.has(command.name) || command.hidden) continue;
    seen.add(command.name);
    lines.push(`  ${command.name.padEnd(12)}${command.summary}`);
  }
  console.log(`Zap CLI ${version}

Usage:
  zap <command> [options]

Commands:
${lines.join("\n")}

Common flags:
  --json              Machine-readable output
  --live              Allow live provider spend for run/ffmpeg
  --input KEY=VALUE   Provide a recipe input; repeatable
  --budget-cap-usd N  Override the recipe spend cap for this run
  --force             Overwrite generated recipe files
  --version           Print version

Run zap <command> --help for command usage.

Install / invoke (Node 24.x):
  npx --yes @wzrdtech/zap@${version} <command>
  npm exec -- zap <command>              # project-local install
  npm install --global @wzrdtech/zap@${version}  # enables the bare zap command
`);
}

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

main(process.argv.slice(2)).catch((error) => {
  const { flags } = parseArgs(process.argv.slice(2));
  printCommandError(error, flags);
  process.exit(exitCodeFor(error));
});
