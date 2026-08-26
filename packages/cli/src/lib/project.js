// @ts-check
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The CLI version, read from the package manifest (Z3). */
export const version = /** @type {{ version: string }} */ (
  JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"))
).version;

/** @param {string} value */
export function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "zap";
}

/** @param {string} value */
export function titleize(value) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

/**
 * @param {string} file
 * @param {string} content
 */
export async function writeNewFile(file, content) {
  if (existsSync(file)) return;
  await fs.writeFile(file, content);
}

/**
 * @param {string} file
 * @param {string} content
 * @param {unknown} force
 */
export async function writeRecipeFile(file, content, force) {
  if (existsSync(file) && !force) throw new Error(`${file} already exists. Re-run with --force to overwrite.`);
  await fs.writeFile(file, content);
}

/**
 * @param {string} source
 * @param {string} target
 * @param {boolean} force
 */
export async function copyDir(source, target, force) {
  await fs.mkdir(target, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) await copyDir(sourcePath, targetPath, force);
    else if (force || !existsSync(targetPath)) await fs.copyFile(sourcePath, targetPath);
  }
}

/**
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function listMarkdownTopics(root) {
  if (!existsSync(root)) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  /** @type {string[][]} */
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listMarkdownTopics(fullPath);
    return entry.name.endsWith(".md") ? [path.relative(root, fullPath).replace(/\.md$/, "")] : [];
  }));
  return nested.flat().sort();
}

/**
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function listFiles(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  /** @type {string[][]} */
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return [fullPath];
  }));
  return files.flat().sort();
}

export async function zapConfigDir() {
  const projectDir = path.join(process.cwd(), ".zap");
  if (existsSync(path.join(process.cwd(), "package.json"))) {
    await fs.mkdir(projectDir, { recursive: true });
    return projectDir;
  }
  const homeDir = path.join(os.homedir(), ".zap");
  await fs.mkdir(homeDir, { recursive: true });
  return homeDir;
}

export function findRepoRoot() {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (existsSync(path.join(current, "package.json")) && existsSync(path.join(current, "packages"))) return current;
    current = path.dirname(current);
  }
  return process.cwd();
}

export function findResourceRoot() {
  const sourceRoot = findRepoRoot();
  if (existsSync(path.join(sourceRoot, "docs")) && existsSync(path.join(sourceRoot, "registry")) && existsSync(path.join(sourceRoot, "skills"))) {
    return sourceRoot;
  }
  const bundledRoot = path.join(packageRoot, "resources");
  if (existsSync(bundledRoot)) return bundledRoot;
  return sourceRoot;
}

/** @param {string} root */
export function assertZapProject(root) {
  if (!existsSync(path.join(root, "package.json")) || !existsSync(path.join(root, "agent", "skills"))) {
    throw new Error("This command must run from a Zap project root. Run `zap init <dir>` first.");
  }
}

/** @param {string} name */
export function hasExecutable(name) {
  const result = spawnSync("which", [name], { encoding: "utf8" });
  return result.status === 0;
}

/**
 * @param {string} binary
 * @param {string[]} args
 */
export function canRun(binary, args) {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout: 8000 });
  return result.status === 0;
}

/**
 * @param {string} name
 * @param {boolean} ok
 * @param {string} detail
 */
export function check(name, ok, detail) {
  return { detail, name, ok };
}

/** @param {number} ms */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @param {string} url */
export function extensionFromUrl(url) {
  const pathname = new URL(url).pathname;
  const extension = path.extname(pathname).replace(/^\./, "");
  return extension || "bin";
}

/**
 * @param {string} script
 * @param {{ json?: unknown }} flags
 * @param {string[]} [extra]
 */
export function proxyPackageScript(script, flags, extra = []) {
  const result = spawnSync("npm", ["run", script, ...extra], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0 && !flags.json) process.exitCode = result.status ?? 1;
}

/** @param {string} cwd */
export function loadDotEnv(cwd) {
  for (const file of [".env.local", ".env"]) {
    const envPath = path.join(cwd, file);
    if (!existsSync(envPath)) continue;
    const lines = execFileSync(process.execPath, ["-e", `
      const fs = require("fs");
      const content = fs.readFileSync(process.argv[1], "utf8");
      console.log(content);
    `, envPath], { encoding: "utf8" }).split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index);
      const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}
