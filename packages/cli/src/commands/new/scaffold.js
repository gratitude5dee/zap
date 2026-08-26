// @ts-check
import { promises as fs } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import { slugify, titleize, writeRecipeFile } from "../../lib/project.js";

export async function scaffoldRecipe(projectRoot, rawSlug, flags) {
  const slug = slugify(rawSlug);
  const skillDir = path.join(projectRoot, "agent", "skills", `zap-${slug}`);
  await fs.mkdir(path.join(skillDir, "prompts"), { recursive: true });
  const skillMd = `# zap-${slug}\n\nUse this skill when a creator wants the ${titleize(slug)} Zap.\n`;
  const zapMd = [
    "---",
    stringify({
      budget: { cap_usd: 5, estimate_usd: 0 },
      defaults: {
        models: {
          "image.gen": "fal-ai/flux/dev",
          "video.gen": "fal-ai/kling-video/v2.1/pro/image-to-video",
        },
        provider: "fal",
      },
      description: `A one-click ${titleize(slug)} content recipe.`,
      inputs: {
        PROMPT: {
          hint: "Describe the scene or transformation.",
          label: "Prompt",
          required: true,
          type: "textarea",
        },
      },
      output: "Zap.mp4",
      steps: [
        {
          id: "initial_frame",
          kind: "image.gen",
          model: "fal-ai/flux/dev",
          prompt: "prompts/initial-frame.md",
          provider: "fal",
        },
        {
          duration_s: 15,
          id: "initial_gen",
          inputs: ["initial_frame"],
          kind: "video.gen",
          model: "fal-ai/kling-video/v2.1/pro/image-to-video",
          prompt: "prompts/initial-gen.md",
          provider: "fal",
        },
        {
          id: "stitch",
          inputs: ["initial_gen"],
          kind: "stitch",
          stitch: { engine: "auto", format: "mp4", quality: "standard" },
        },
      ],
      version: 2,
      zap: slug,
    }).trim(),
    "---",
    "",
    `# ${titleize(slug)}`,
    "",
  ].join("\n");

  await writeRecipeFile(path.join(skillDir, "SKILL.md"), skillMd, flags.force);
  await writeRecipeFile(path.join(skillDir, "Zap.md"), zapMd, flags.force);
  await writeRecipeFile(path.join(skillDir, "prompts", "initial-frame.md"), "Create a cinematic first frame for: {PROMPT}\n", flags.force);
  await writeRecipeFile(path.join(skillDir, "prompts", "initial-gen.md"), "Animate the first frame into a polished 15 second video: {PROMPT}\n", flags.force);
  return { skillDir, slug };
}
