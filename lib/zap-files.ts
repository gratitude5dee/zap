import { promises as fs } from "node:fs";
import path from "node:path";
import { parseZapMarkdown, publicZapSpec, type PublicZapSpec, type ZapSpec } from "./zap-schema";

const skillsDir = path.join(process.cwd(), "agent", "skills");

export async function loadZapFromSkill(slug: string): Promise<PublicZapSpec | null> {
  const spec = await loadZapSpec(slug);
  return spec ? publicZapSpec(spec) : null;
}

export async function loadZapSpec(slug: string): Promise<ZapSpec | null> {
  const file = path.join(skillsDir, `zap-${slug}`, "Zap.md");
  try {
    return parseZapMarkdown(await fs.readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listZapSpecs(): Promise<PublicZapSpec[]> {
  const entries = await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []);
  const zaps = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("zap-"))
    .map((entry) => loadZapFromSkill(entry.name.slice("zap-".length))));
  return zaps
    .filter((zap): zap is PublicZapSpec => Boolean(zap))
    .sort((left, right) => left.title.localeCompare(right.title));
}

export async function readPrompt(slug: string, promptPath?: string) {
  if (!promptPath) return "";
  const file = path.join(skillsDir, `zap-${slug}`, promptPath);
  return fs.readFile(file, "utf8");
}
