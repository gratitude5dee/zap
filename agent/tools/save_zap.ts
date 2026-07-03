import { promises as fs } from "node:fs";
import path from "node:path";
import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { parseZapMarkdown } from "../../lib/zap-schema.js";

export default defineTool({
  description: "Save an approved Zap.md recipe as a packaged Eve skill.",
  inputSchema: z.object({
    markdown: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
  }),
  approval: always(),
  async execute({ markdown, slug }) {
    const spec = parseZapMarkdown(markdown);
    if (spec.zap !== slug) {
      throw new Error(`Zap slug mismatch: frontmatter declares ${spec.zap}, tool input was ${slug}.`);
    }
    const dir = path.join(process.cwd(), "agent", "skills", `zap-${slug}`);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "Zap.md"), markdown);
    await fs.writeFile(path.join(dir, "SKILL.md"), skillWrapper(spec.description, slug));
    return { path: `agent/skills/zap-${slug}/Zap.md`, slug };
  },
});

function skillWrapper(description: string, slug: string) {
  return `---\ndescription: ${JSON.stringify(description)}\n---\n\n# Zap ${slug}\n\nExecutable Zap frontmatter and creative direction live in ./Zap.md. Use this skill when authoring or running the ${slug} recipe.\n`;
}
