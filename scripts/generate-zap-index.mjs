import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";

const options = parseArgs(process.argv.slice(2));
const registryDir = path.join(options.root, "registry", "zaps");
const canonicalPath = path.join(registryDir, "index.json");
const bundledPath = path.join(options.root, "packages", "cli", "resources", "registry", "zaps", "index.json");
const index = await buildRegistryIndex(registryDir);
const output = `${JSON.stringify(index, null, 2)}\n`;
const targets = [canonicalPath];

if (await isDirectory(path.dirname(bundledPath))) targets.push(bundledPath);

if (options.check) {
  const stale = [];
  for (const target of targets) {
    const current = await fs.readFile(target, "utf8").catch(() => "");
    if (current !== output) stale.push(target);
  }
  if (stale.length > 0) {
    console.error(`Zap registry index is out of date: ${stale.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Zap registry index is current (${index.zaps.length} templates).`);
  }
} else {
  for (const target of targets) {
    await fs.writeFile(target, output);
  }
  console.log(`Generated ${targets.join(" and ")} (${index.zaps.length} templates).`);
}

async function buildRegistryIndex(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const zaps = [];

  for (const entry of entries.filter((candidate) => candidate.isDirectory() && candidate.name.startsWith("zap-")).sort((a, b) => a.name.localeCompare(b.name))) {
    const markdown = await fs.readFile(path.join(root, entry.name, "Zap.md"), "utf8");
    const spec = parseZapFrontmatter(markdown, entry.name);
    if (entry.name !== `zap-${spec.zap}`) {
      throw new Error(`${entry.name}/Zap.md declares mismatched slug ${spec.zap}.`);
    }
    const providers = Array.from(new Set([
      spec.defaults?.provider,
      ...spec.steps.map((step) => step.provider),
    ].filter((provider) => typeof provider === "string" && provider.length > 0))).sort();

    zaps.push({
      budget: {
        cap_usd: Number(spec.budget.cap_usd),
        estimate_usd: Number(spec.budget.estimate_usd),
      },
      description: spec.description,
      inputs: spec.inputs ?? {},
      providers,
      slug: spec.zap,
      tags: Array.from(new Set(spec.zap.split("-").filter(Boolean))).sort(),
      title: titleize(spec.zap),
    });
  }

  return { version: 1, zaps: zaps.sort((left, right) => left.slug.localeCompare(right.slug)) };
}

function parseZapFrontmatter(markdown, source) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`${source} is missing YAML frontmatter.`);
  const spec = parseDocument(match[1]).toJS();
  if (!spec || typeof spec !== "object") throw new Error(`${source} has invalid frontmatter.`);
  if (typeof spec.zap !== "string" || typeof spec.description !== "string") {
    throw new Error(`${source} must declare zap and description.`);
  }
  if (!spec.budget || !Number.isFinite(Number(spec.budget.cap_usd)) || !Number.isFinite(Number(spec.budget.estimate_usd))) {
    throw new Error(`${source} must declare numeric budget limits.`);
  }
  if (!Array.isArray(spec.steps)) throw new Error(`${source} must declare steps.`);
  return spec;
}

function parseArgs(argv) {
  let check = false;
  let root = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--check") {
      check = true;
      continue;
    }
    if (argv[index] === "--root" && argv[index + 1]) {
      root = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument ${argv[index]}.`);
  }
  return { check, root: path.resolve(root) };
}

async function isDirectory(directory) {
  return (await fs.stat(directory).catch(() => null))?.isDirectory() ?? false;
}

function titleize(slug) {
  return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
