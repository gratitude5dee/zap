import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve("docs");
const targetRoot = path.resolve("packages/cli/resources/docs");

rmSync(targetRoot, { force: true, recursive: true });
copyMarkdownTree(sourceRoot, targetRoot);

function copyMarkdownTree(source, target) {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
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
