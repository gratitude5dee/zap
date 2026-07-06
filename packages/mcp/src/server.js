import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseZapMarkdown, validateZapPromptTemplates } from "@wzrdtech/core/schema";
import * as z from "zod/v4";

export const ZAP_MCP_TOOLS = [
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

export async function startZapMcpServer({ transport = new StdioServerTransport() } = {}) {
  const server = new McpServer(
    {
      name: "@wzrdtech/zap-mcp",
      version: "0.3.0",
      websiteUrl: "https://zap.wzrd.tech",
    },
    {
      capabilities: { tools: {} },
      instructions: [
        "Use Zap MCP tools to validate, plan, inspect, deploy, and import Zap recipes.",
        "Live runs use the caller process environment and local Zap credential store.",
        "Secret values are never returned by zap_keys_list.",
      ].join(" "),
    },
  );

  registerTools(server);
  await server.connect(transport);
}

function registerTools(server) {
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

async function validateZap({ promptContents, zapMd, zapMdPath }) {
  if (!zapMd && !zapMdPath) throw new Error("zap_validate requires zapMdPath or zapMd.");
  const file = zapMdPath ? path.resolve(process.cwd(), zapMdPath) : undefined;
  const markdown = zapMd ?? await fs.readFile(file, "utf8");
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

function runArgs({ budgetCapUsd, inputs, mode, provider, zapMdPath }) {
  const args = ["run", zapMdPath, "--json"];
  if (mode === "live") args.push("--live");
  if (provider) args.push("--provider", provider);
  if (budgetCapUsd !== undefined) args.push("--budget-cap-usd", String(budgetCapUsd));
  for (const [key, value] of Object.entries(inputs ?? {})) args.push("--input", `${key}=${value}`);
  return args;
}

function importArgs(sourceName, { force, limit, name, source }) {
  const args = ["import", sourceName, "--json"];
  if (force) args.push("--force");
  if (limit !== undefined) args.push("--limit", String(limit));
  if (name) args.push("--name", Array.isArray(name) ? name.join(",") : name);
  if (source) args.push("--source", source);
  return args;
}

async function cliTool(args) {
  try {
    const payload = await runZapJson(args);
    return toolJson(payload);
  } catch (error) {
    return {
      content: [{ text: JSON.stringify({ error: error.message }, null, 2), type: "text" }],
      isError: true,
    };
  }
}

async function runZapJson(args) {
  const result = await runZap(args);
  const text = result.stdout.trim();
  if (!text) return { ok: result.code === 0, stderr: result.stderr.trim() };
  try {
    return JSON.parse(text);
  } catch {
    return { ok: result.code === 0, stderr: result.stderr.trim(), stdout: text };
  }
}

async function runZap(args) {
  const command = await resolveZapCommand();
  const childArgs = command.kind === "node" ? [command.bin, ...args] : args;
  return await new Promise((resolve, reject) => {
    const child = spawn(command.kind === "node" ? process.execPath : command.bin, childArgs, {
      cwd: process.cwd(),
      env: { ...process.env, ZAP_MCP_CHILD: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ code, stderr, stdout });
      else reject(new Error((stderr || stdout || `zap exited with ${code}`).trim()));
    });
  });
}

async function resolveZapCommand() {
  const explicit = process.env.ZAP_CLI_BIN;
  if (explicit) return existsSync(explicit) ? { bin: explicit, kind: "node" } : { bin: explicit, kind: "command" };

  const local = fileURLToPath(new URL("../../cli/bin/zap.js", import.meta.url));
  if (existsSync(local)) return { bin: local, kind: "node" };

  const linked = path.join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "zap.cmd" : "zap");
  if (existsSync(linked)) return { bin: linked, kind: "command" };

  return { bin: "zap", kind: "command" };
}

function toolJson(value) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: "text" }],
  };
}
