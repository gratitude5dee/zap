// @ts-check
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { printJson } from "../../lib/output.js";
import { findResourceRoot, listFiles } from "../../lib/project.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "skills",
  summary: "Generate or check skills/skills-manifest.json",
  usage: "zap skills [generate|update|check] [--json]",
  async run({ args, flags }) {
    const subcommand = args[0] ?? "generate";
    const resourceRoot = findResourceRoot();
    const skillsDir = path.join(resourceRoot, "skills");
    const manifest = await generateSkillManifest(skillsDir, resourceRoot);
    const manifestPath = path.join(skillsDir, "skills-manifest.json");
    if (subcommand === "check") {
      const existing = existsSync(manifestPath) ? JSON.parse(await fs.readFile(manifestPath, "utf8")) : null;
      const differences = compareSkillManifests(existing, manifest);
      const result = { differences, manifestPath, ok: differences.length === 0 };
      if (flags.json) printJson(result);
      else if (result.ok) console.log(`ok ${manifestPath}`);
      else differences.forEach((difference) => console.log(`mismatch ${difference}`));
      if (!result.ok) process.exitCode = 1;
      return;
    }
    if (subcommand !== "generate" && subcommand !== "update") {
      throw new Error("Usage: zap skills [generate|update|check] [--json]");
    }
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    if (flags.json) printJson(manifest);
    else {
      console.log(`Generated ${manifestPath}`);
      manifest.skills.forEach((skill) => console.log(`${skill.skill} ${skill.fileCount} ${skill.hash.slice(0, 12)}`));
    }
  },
};

async function generateSkillManifest(skillsDir, baseDir = path.dirname(skillsDir)) {
  if (!existsSync(skillsDir)) return { generatedAt: new Date().toISOString(), skills: [], version: 1 };
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(skillsDir, entry.name);
    const files = await listFiles(root);
    const hash = createHash("sha256");
    for (const file of files) {
      hash.update(path.relative(root, file));
      hash.update(await fs.readFile(file));
    }
    skills.push({ fileCount: files.length, hash: hash.digest("hex"), path: path.relative(baseDir, root), skill: entry.name });
  }
  return { generatedAt: new Date().toISOString(), skills: skills.sort((left, right) => left.skill.localeCompare(right.skill)), version: 1 };
}

function compareSkillManifests(existing, current) {
  if (!existing) return ["missing skills-manifest.json"];
  const existingEntries = new Map((existing.skills ?? []).map((entry) => [entry.skill, entry]));
  const currentEntries = new Map(current.skills.map((entry) => [entry.skill, entry]));
  const differences = [];
  for (const [skill, entry] of currentEntries) {
    const prior = existingEntries.get(skill);
    if (!prior) {
      differences.push(`${skill} missing from manifest`);
      continue;
    }
    if (prior.hash !== entry.hash || prior.fileCount !== entry.fileCount || prior.path !== entry.path) {
      differences.push(`${skill} hash/file metadata changed`);
    }
  }
  for (const skill of existingEntries.keys()) {
    if (!currentEntries.has(skill)) differences.push(`${skill} exists in manifest but not on disk`);
  }
  return differences;
}
