// @ts-check
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument, stringify } from "yaml";
import { parseCsvFlag } from "../../lib/args.js";
import { printJson } from "../../lib/output.js";
import { assertZapProject, slugify, titleize, writeNewFile, writeRecipeFile } from "../../lib/project.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "import",
  summary: "Import hyperframes or openmontage templates",
  usage: "zap import <hyperframes|openmontage> [--source path] [--limit n] [--force] [--json]",
  async run({ args, flags }) {
    assertZapProject(process.cwd());
    const source = args[0] ?? flags.from;
    if (source === "hyperframes") return importHyperframes(flags);
    if (source === "openmontage") return importOpenMontage(flags);
    throw new Error("Usage: zap import <hyperframes|openmontage> [--source path] [--limit n] [--force]");
  },
};

async function importHyperframes(flags) {
  const registryFile = path.resolve(process.cwd(), String(flags.source ?? "../hyperframes-main/registry/registry.json"));
  const registry = JSON.parse(await fs.readFile(registryFile, "utf8"));
  await ensureDesignBrief();
  const names = parseCsvFlag(flags.name);
  const limit = Number(flags.limit ?? 12);
  const items = (registry.items ?? [])
    .filter((item) => names.length === 0 || names.includes(item.name))
    .slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined);
  const imported = [];
  for (const item of items) {
    const slug = `hf-${slugify(item.name)}`;
    const skillDir = await writeImportedZap({
      description: `HyperFrames ${item.name} template packaged as a Zap recipe.`,
      metadata: { source: "hyperframes", template: item.name, type: item.type },
      prompts: {
        "prompts/initial-frame.md": `Create a strong visual frame for {PROMPT} that fits the HyperFrames template "${item.name}".\n`,
        "prompts/initial-gen.md": `Animate the frame into a short polished video for {PROMPT}. Preserve the visual grammar of "${item.name}".\n`,
      },
      slug,
      stitch: { engine: "hyperframes", format: "mp4", inputs: { template: item.name }, quality: "standard", template: item.name },
      title: `HyperFrames ${titleize(item.name)}`,
    }, flags);
    imported.push({ skillDir, slug, template: item.name });
  }
  if (flags.json) printJson({ imported, registryFile });
  else imported.forEach((entry) => console.log(`Imported ${entry.template} -> zap-${entry.slug}`));
}

async function ensureDesignBrief() {
  await writeNewFile(path.join(process.cwd(), "DESIGN.md"), [
    "# Zap Design Brief",
    "",
    "- Use the imported HyperFrames template as the motion/layout reference.",
    "- Keep typography high-contrast, legible, and aligned to the recipe prompt.",
    "- Avoid decorative filler that hides generated media or text.",
    "",
  ].join("\n"));
}

async function importOpenMontage(flags) {
  const pipelinesDir = path.resolve(process.cwd(), String(flags.source ?? "../OpenMontage-main/pipeline_defs"));
  const names = parseCsvFlag(flags.name);
  const files = (await fs.readdir(pipelinesDir))
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .filter((file) => names.length === 0 || names.includes(file.replace(/\.ya?ml$/, "")))
    .sort();
  const limit = Number(flags.limit ?? files.length);
  const imported = [];
  for (const fileName of files.slice(0, Number.isFinite(limit) && limit > 0 ? limit : undefined)) {
    const file = path.join(pipelinesDir, fileName);
    const pipeline = parseDocument(await fs.readFile(file, "utf8")).toJS() ?? {};
    const name = String(pipeline.name ?? fileName.replace(/\.ya?ml$/, ""));
    const slug = `om-${slugify(name)}`;
    const stageNames = Array.isArray(pipeline.stages) ? pipeline.stages.map((stage) => stage?.name).filter(Boolean) : [];
    const skillDir = await writeImportedZap({
      description: String(pipeline.description ?? `OpenMontage ${name} pipeline packaged as a Zap recipe.`).replace(/\s+/g, " ").trim(),
      metadata: {
        category: pipeline.category,
        source: "openmontage",
        stability: pipeline.stability,
        stages: stageNames,
      },
      prompts: {
        "prompts/initial-frame.md": `Create a reference frame for an OpenMontage ${name} production: {PROMPT}\n`,
        "prompts/initial-gen.md": `Generate a short ${name} sequence from the approved frame: {PROMPT}\n`,
      },
      slug,
      stitch: { engine: "auto", format: "mp4", inputs: { pipeline: name, stages: stageNames }, quality: "standard", template: `openmontage:${name}` },
      title: `OpenMontage ${titleize(name)}`,
    }, flags);
    imported.push({ pipeline: name, skillDir, slug });
  }
  if (flags.json) printJson({ imported, pipelinesDir });
  else imported.forEach((entry) => console.log(`Imported ${entry.pipeline} -> zap-${entry.slug}`));
}

async function writeImportedZap({ description, metadata, prompts, slug, stitch, title }, flags) {
  const skillDir = path.join(process.cwd(), "agent", "skills", `zap-${slug}`);
  await fs.mkdir(path.join(skillDir, "prompts"), { recursive: true });
  const zapMd = [
    "---",
    stringify({
      budget: { cap_usd: 5, estimate_usd: 0.25 },
      defaults: {
        models: {
          "image.gen": "fal-ai/flux/dev",
          "video.gen": "fal-ai/kling-video/v2.1/pro/image-to-video",
        },
        provider: "fal",
      },
      description,
      inputs: {
        PROMPT: {
          hint: "Describe the piece to produce.",
          label: "Prompt",
          required: true,
          type: "textarea",
        },
      },
      output: "Zap.mp4",
      publish: { slug, visibility: "public" },
      steps: [
        {
          id: "initial_frame",
          kind: "image.gen",
          model: "fal-ai/flux/dev",
          prompt: "prompts/initial-frame.md",
          provider: "fal",
        },
        {
          duration_s: 8,
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
          stitch,
        },
      ],
      version: 2,
      x_source: metadata,
      zap: slug,
    }).trim(),
    "---",
    "",
    `# ${title}`,
    "",
  ].join("\n");
  await writeRecipeFile(path.join(skillDir, "SKILL.md"), `# zap-${slug}\n\nUse this skill when a creator wants ${title}.\n`, flags.force);
  await writeRecipeFile(path.join(skillDir, "Zap.md"), zapMd, flags.force);
  for (const [promptPath, content] of Object.entries(prompts)) {
    await writeRecipeFile(path.join(skillDir, promptPath), content, flags.force);
  }
  return skillDir;
}
