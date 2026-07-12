import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const executable = path.join(
  appRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "eve.cmd" : "eve",
);
const result = spawnSync(executable, ["info"], {
  cwd: appRoot,
  encoding: "utf8",
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

const manifestPath = path.join(appRoot, ".eve", "compile", "compiled-agent-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const routes = Array.isArray(manifest.channels)
  ? manifest.channels
      .filter((entry) => typeof entry?.method === "string" && typeof entry?.urlPath === "string")
      .sort((left, right) => `${left.urlPath}:${left.method}`.localeCompare(`${right.urlPath}:${right.method}`))
  : [];

process.stdout.write("\nAuthored Routes\n");
process.stdout.write("===============\n");
for (const route of routes) {
  process.stdout.write(`${route.method.padEnd(6)} ${route.urlPath.padEnd(40)} ${route.name}\n`);
}
