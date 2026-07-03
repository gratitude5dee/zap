import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type SkillManifestEntry = {
  fileCount: number;
  hash: string;
  path: string;
  skill: string;
};

export type SkillManifest = {
  generatedAt: string;
  skills: SkillManifestEntry[];
  version: 1;
};

export async function generateSkillManifest(skillsDir: string): Promise<SkillManifest> {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  const skills: SkillManifestEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const root = path.join(skillsDir, entry.name);
    const files = await listFiles(root);
    const hash = createHash("sha256");
    for (const file of files) {
      const relative = path.relative(root, file);
      hash.update(relative);
      hash.update(await fs.readFile(file));
    }
    skills.push({
      fileCount: files.length,
      hash: hash.digest("hex"),
      path: path.relative(process.cwd(), root),
      skill: entry.name,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    skills: skills.sort((left, right) => left.skill.localeCompare(right.skill)),
    version: 1,
  };
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return [fullPath];
  }));
  return files.flat().sort();
}
