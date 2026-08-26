import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listZapSkillDownloads, readZapSkill } from "../lib/zap-skills";
import { parseSkillMarkdown, SKILL_STORE_ROOT, skillStorePath } from "../packages/core/src/skill-manifest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = path.join(repoRoot, "skills");

const Z8_SKILLS = ["zap-runtime", "zap-compose", "zap-templates", "zap-pay", "zap-memory", "zap-lanes"];

describe("Zap skill registry", () => {
  it("adds stable download URLs to the bundled manifest", async () => {
    const manifest = await listZapSkillDownloads("https://zap.wzrd.tech");
    const core = manifest.skills.find((entry) => entry.skill === "zap");

    expect(core?.downloadUrl).toBe("https://zap.wzrd.tech/api/skills/zap");
    expect(core?.jsonUrl).toBe("https://zap.wzrd.tech/api/skills/zap?format=json");
    expect(manifest.skills.length).toBeGreaterThan(0);
  });

  it("serves only manifest-listed skills", async () => {
    const core = await readZapSkill("zap");

    expect(core?.content).toContain("# zap");
    expect(await readZapSkill("../package")).toBeNull();
  });

  it("lists every Z8 skill in the source manifest with a matching hash", async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(skillsRoot, "skills-manifest.json"), "utf8")) as {
      skills: Array<{ fileCount: number; hash: string; path: string; skill: string }>;
    };
    for (const skill of Z8_SKILLS) {
      const entry = manifest.skills.find((candidate) => candidate.skill === skill);
      expect(entry, `${skill} listed in skills-manifest.json`).toBeDefined();
      if (!entry) continue;
      expect(await hashSkillDir(path.join(repoRoot, entry.path))).toBe(entry.hash);
    }
  });

  it("keeps every Z8 SKILL.md within 2 KB and valid against the skill contract", async () => {
    for (const skill of Z8_SKILLS) {
      const file = path.join(skillsRoot, skill, "SKILL.md");
      const markdown = await fs.readFile(file, "utf8");
      expect(Buffer.byteLength(markdown, "utf8"), `${skill} SKILL.md ≤ 2 KB`).toBeLessThanOrEqual(2048);
      const parsed = parseSkillMarkdown(markdown);
      expect(parsed.frontmatter.name).toBe(skill);
      expect(parsed.frontmatter.description.length).toBeGreaterThan(0);
      expect(parsed.frontmatter.version.length).toBeGreaterThan(0);
    }
  });

  it("validates every template skill against the contract", async () => {
    const templatesRoot = path.join(repoRoot, "packages", "templates");
    for (const template of readdirSync(templatesRoot)) {
      const templateSkills = path.join(templatesRoot, template, "skills");
      if (!existsSync(templateSkills)) continue;
      for (const skill of readdirSync(templateSkills)) {
        const file = path.join(templateSkills, skill, "SKILL.md");
        if (!existsSync(file)) continue;
        const parsed = parseSkillMarkdown(await fs.readFile(file, "utf8"));
        expect(parsed.frontmatter.name, `${template}/${skill}`).toBe(skill);
      }
    }
  });

  it("documents the VM skill store path", () => {
    expect(SKILL_STORE_ROOT).toBe("/zap/skills");
    expect(skillStorePath("zap-runtime")).toBe("/zap/skills/zap-runtime/SKILL.md");
    expect(() => skillStorePath("../escape")).toThrow();
  });
});

async function hashSkillDir(root: string): Promise<string> {
  const files = await listFiles(root);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file));
    hash.update(await fs.readFile(file));
  }
  return hash.digest("hex");
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) return listFiles(fullPath);
      return [fullPath];
    }),
  );
  return files.flat().sort();
}
