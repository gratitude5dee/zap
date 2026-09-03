// exo library tool module installed at /zap/exo/zap-tools.mjs by bake.sh and
// registered on the Zap exo agent via `--tool-module`. It is the exo-side
// counterpart of `defineRecipeTool` in @wzrdtech/zap-agent: every Zap.md
// recipe under /zap/skills becomes a `recipe:<slug>` tool that runs
// `zap run ... --json`, plan-only unless the model passes `live: true` (which
// still fails closed without a payer). Never touches provider keys.
import { execFile } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

// Plain ESM (no build step on the box); shapes follow @exo/harness/tool
// (Tool, ToolModuleEntry, ToolModule).

const SKILLS_DIR = process.env.ZAP_SKILLS_DIR ?? "/zap/skills";
const RECIPE_PREFIX = "zap-";

const execFileAsync = promisify(execFile);

function recipeSlugs() {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(RECIPE_PREFIX))
    .filter((entry) => existsSync(path.join(SKILLS_DIR, entry.name, "Zap.md")))
    .map((entry) => entry.name.slice(RECIPE_PREFIX.length))
    .sort();
}

const noInitialization = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

export const listRecipesTool = {
  definition: {
    name: "zap_list_recipes",
    description: "List the Zap.md recipes mounted under /zap/skills that recipe:<slug> tools can run.",
    parameters: { type: "object", additionalProperties: false, properties: {}, required: [] },
  },
  initializationParameters: noInitialization,
  initialize() {
    return {
      async execute() {
        return { recipes: recipeSlugs() };
      },
    };
  },
};

/** @param {string} slug */
export function recipeTool(slug) {
  return {
    definition: {
      name: `recipe:${slug}`,
      description: `Run the ${slug} Zap.md recipe (plan by default; live spends only with a payer configured).`,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          inputs: {
            type: "object",
            description: "Recipe inputs as declared in Zap.md frontmatter.",
            additionalProperties: { type: "string" },
          },
          live: {
            type: "boolean",
            description: "Execute for real instead of planning. Requires an explicit user request.",
          },
        },
        required: ["inputs", "live"],
      },
    },
    initializationParameters: noInitialization,
    initialize() {
      return {
        /** @param {Record<string, unknown>} args */
        async execute(args) {
          const inputs = args.inputs;
          const argv = ["run", path.join(SKILLS_DIR, `${RECIPE_PREFIX}${slug}`, "Zap.md"), "--json"];
          if (args.live === true) argv.push("--live");
          if (inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
            for (const [key, value] of Object.entries(inputs)) {
              if (typeof value === "string") argv.push("--input", `${key}=${value}`);
            }
          }
          const { stdout } = await execFileAsync("zap", argv, { maxBuffer: 8 * 1024 * 1024 });
          const parsed = JSON.parse(stdout || "{}");
          return {
            runId: typeof parsed.runId === "string" ? parsed.runId : "",
            status: typeof parsed.status === "string" ? parsed.status : args.live === true ? "completed" : "planned",
            quoteUsd: typeof parsed.quoteUsd === "number" ? parsed.quoteUsd : 0,
          };
        },
      };
    },
  };
}

const toolModule = {
  tools: [{ tool: listRecipesTool }, ...recipeSlugs().map((slug) => ({ tool: recipeTool(slug) }))],
};

export default toolModule;
