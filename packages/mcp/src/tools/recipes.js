// @ts-check
// Legacy 0.3.1 recipe tools (validate, lint, run, status, keys, gallery,
// deploy, imports, docs). Auto-registered by packages/mcp/src/server.js.
import { promises as fs } from "node:fs";
import path from "node:path";
import { parseZapMarkdown, validateZapPromptTemplates } from "@wzrdtech/core/schema";
import * as z from "zod/v4";
import { cliTool, toolJson } from "../tool-helpers.js";

export const toolNames = [
  "zap_validate",
  "zap_lint",
  "zap_run",
  "zap_status",
  "zap_keys_list",
  "zap_gallery_list",
  "zap_deploy",
  "zap_import_hyperframes",
  "zap_import_openmontage",
  "zap_docs",
];

/** @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server */
export function register(server) {
  server.registerTool(
    "zap_validate",
    {
      title: "Validate Zap",
      description: "Validate a Zap.md path or raw Zap.md frontmatter.",
      inputSchema: {
        promptContents: z.record(z.string(), z.string()).optional(),
        zapMd: z.string().optional(),
        zapMdPath: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => toolJson(await validateZap(input)),
  );

  server.registerTool(
    "zap_lint",
    {
      title: "Lint Zap",
      description: "Run Zap recipe policy checks through the CLI.",
      inputSchema: {
        zapMdPath: z.string().describe("Path to Zap.md or a local Zap slug."),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ zapMdPath }) => cliTool(["lint", zapMdPath, "--json"]),
  );

  server.registerTool(
    "zap_run",
    {
      title: "Run Zap",
      description: "Plan or live-run a Zap through the CLI. Defaults to plan mode.",
      inputSchema: {
        budgetCapUsd: z.number().optional(),
        inputs: z.record(z.string(), z.string()).optional(),
        mode: z.enum(["plan", "live"]).default("plan"),
        provider: z.string().optional(),
        zapMdPath: z.string().describe("Path to Zap.md or a local Zap slug."),
      },
      annotations: { destructiveHint: true },
    },
    async (input) => cliTool(runArgs(input)),
  );

  server.registerTool(
    "zap_status",
    {
      title: "Zap Status",
      description: "Read local Zap run status.",
      inputSchema: {
        runId: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ runId }) => cliTool(["status", ...(runId ? [runId] : []), "--json"]),
  );

  server.registerTool(
    "zap_keys_list",
    {
      title: "List Zap Keys",
      description: "List locally configured provider keys with masked values only.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => cliTool(["keys", "list", "--json"]),
  );

  server.registerTool(
    "zap_gallery_list",
    {
      title: "List Zap Gallery",
      description: "List local recipes or the hosted gallery.",
      inputSchema: {
        apiUrl: z.string().url().optional(),
        remote: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ apiUrl, remote }) => {
      const args = ["gallery", "--json"];
      if (remote) args.push("--remote");
      if (apiUrl) args.push("--api-url", apiUrl);
      return cliTool(args);
    },
  );

  server.registerTool(
    "zap_deploy",
    {
      title: "Deploy Zap",
      description: "Upload a draft Zap, optionally finalizing it into the gallery. Auth is inherited from zap login or ZAP_TOKEN.",
      inputSchema: {
        apiUrl: z.string().url().optional(),
        finalize: z.boolean().default(false),
        zapMdPath: z.string().describe("Path to Zap.md or a local Zap slug."),
      },
      annotations: { destructiveHint: true },
    },
    async ({ apiUrl, finalize, zapMdPath }) => {
      const args = ["deploy", zapMdPath, "--json"];
      if (finalize) args.push("--finalize");
      if (apiUrl) args.push("--api-url", apiUrl);
      return cliTool(args);
    },
  );

  server.registerTool(
    "zap_import_hyperframes",
    {
      title: "Import HyperFrames",
      description: "Import HyperFrames registry templates as local Zap recipes.",
      inputSchema: {
        force: z.boolean().default(false),
        limit: z.number().int().positive().optional(),
        name: z.union([z.string(), z.array(z.string())]).optional(),
        source: z.string().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async (input) => cliTool(importArgs("hyperframes", input)),
  );

  server.registerTool(
    "zap_import_openmontage",
    {
      title: "Import OpenMontage",
      description: "Import OpenMontage pipeline definitions as local Zap recipes.",
      inputSchema: {
        force: z.boolean().default(false),
        limit: z.number().int().positive().optional(),
        name: z.union([z.string(), z.array(z.string())]).optional(),
        source: z.string().optional(),
      },
      annotations: { destructiveHint: true },
    },
    async (input) => cliTool(importArgs("openmontage", input)),
  );

  server.registerTool(
    "zap_docs",
    {
      title: "Read Zap Docs",
      description: "Read a bundled Zap documentation topic.",
      inputSchema: {
        topic: z.string().optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ topic }) => cliTool(["docs", ...(topic ? [topic] : []), "--json"]),
  );
}

/**
 * @param {{ promptContents?: Record<string, string>; zapMd?: string; zapMdPath?: string }} input
 */
async function validateZap({ promptContents, zapMd, zapMdPath }) {
  if (!zapMd && !zapMdPath) throw new Error("zap_validate requires zapMdPath or zapMd.");
  const file = zapMdPath ? path.resolve(process.cwd(), zapMdPath) : undefined;
  const markdown = zapMd ?? await fs.readFile(/** @type {string} */ (file), "utf8");
  const spec = parseZapMarkdown(markdown);
  const prompts = promptContents ?? (file ? await readPromptContents(file, spec) : {});
  validateZapPromptTemplates(spec, prompts);
  return {
    results: [
      {
        file: file ?? "<inline>",
        ok: true,
        zap: spec.zap,
      },
    ],
  };
}

/**
 * @param {string} zapFile
 * @param {ReturnType<typeof parseZapMarkdown>} spec
 */
async function readPromptContents(zapFile, spec) {
  const root = path.dirname(zapFile);
  const entries = await Promise.all(
    spec.steps
      .map((step) => step.prompt)
      .filter((prompt) => typeof prompt === "string" && prompt.endsWith(".md"))
      .map(async (prompt) => [prompt, await fs.readFile(path.join(root, prompt), "utf8")]),
  );
  return Object.fromEntries(entries);
}

/**
 * @param {{ budgetCapUsd?: number; inputs?: Record<string, string>; mode: "plan" | "live"; provider?: string; zapMdPath: string }} input
 */
function runArgs({ budgetCapUsd, inputs, mode, provider, zapMdPath }) {
  const args = ["run", zapMdPath, "--json"];
  if (mode === "live") args.push("--live");
  if (provider) args.push("--provider", provider);
  if (budgetCapUsd !== undefined) args.push("--budget-cap-usd", String(budgetCapUsd));
  for (const [key, value] of Object.entries(inputs ?? {})) args.push("--input", `${key}=${value}`);
  return args;
}

/**
 * @param {string} sourceName
 * @param {{ force: boolean; limit?: number; name?: string | string[]; source?: string }} input
 */
function importArgs(sourceName, { force, limit, name, source }) {
  const args = ["import", sourceName, "--json"];
  if (force) args.push("--force");
  if (limit !== undefined) args.push("--limit", String(limit));
  if (name) args.push("--name", Array.isArray(name) ? name.join(",") : name);
  if (source) args.push("--source", source);
  return args;
}
