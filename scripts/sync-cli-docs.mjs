import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { commandHelp, discoverCommands } from "../packages/cli/src/lib/registry.js";

const sourceRoot = path.resolve("docs");
const targetRoot = path.resolve("packages/cli/resources/docs");

await regenerateCommandList(path.join(sourceRoot, "reference", "cli.md"));
rmSync(targetRoot, { force: true, recursive: true });
copyMarkdownTree(sourceRoot, targetRoot);

/** Regenerates the command table in docs/reference/cli.md from the discovered command set. */
async function regenerateCommandList(cliDoc) {
  const registry = await discoverCommands();
  const seen = new Set();
  const lines = [];
  for (const command of registry.values()) {
    if (seen.has(command.name) || command.hidden) continue;
    seen.add(command.name);
    const help = commandHelp(command);
    const summary = help.summary.replace(/</g, "\\<");
    lines.push(`- \`${help.usage}\` — ${summary}.`);
  }
  const content = readFileSync(cliDoc, "utf8");
  const updated = content.replace(
    /\{\/\* zap-commands:start \*\/\}[\s\S]*?\{\/\* zap-commands:end \*\/\}/,
    `{/* zap-commands:start */}\n${lines.join("\n")}\n{/* zap-commands:end */}`,
  );
  writeFileSync(cliDoc, updated);
}

function copyMarkdownTree(source, target) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyMarkdownTree(sourcePath, targetPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    mkdirSync(path.dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
  }
}
