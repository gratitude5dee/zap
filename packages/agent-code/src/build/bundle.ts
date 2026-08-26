// Build: bundle a project (project.ts + agents/**) into one immutable,
// content-addressed ESM file plus a value-free manifest.
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build as esbuild } from "esbuild";
import { AgentCodeError, type Agent, type Connection, type McpServerRef, type AnyTool } from "../types.ts";
import { lintProject, scanHookIds } from "./lint.ts";
import { manifestEntryFor, type DeploymentManifest, type LoadedAgentModules } from "./manifest.ts";

export interface BuildProjectOptions {
  rootDir: string;
  outDir: string;
  projectName?: string;
  skipLint?: boolean;
}

export interface BuildProjectResult {
  manifest: DeploymentManifest;
  bundlePath: string;
  bundleSha: string;
  errors: Array<{ code: string; file: string; message: string }>;
}

async function exists(target: string): Promise<boolean> {
  return fs
    .access(target)
    .then(() => true)
    .catch(() => false);
}

export async function listAgentDirs(rootDir: string): Promise<string[]> {
  const agentsDir = path.join(rootDir, "agents");
  if (!(await exists(agentsDir))) return [];
  const entries = await fs.readdir(agentsDir, { withFileTypes: true });
  const ids: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && (await exists(path.join(agentsDir, entry.name, "agent.ts")))) {
      ids.push(entry.name);
    }
  }
  return ids.sort();
}

async function agentModuleFiles(rootDir: string, agentId: string): Promise<string[]> {
  const dir = path.join(rootDir, "agents", agentId);
  const files = [path.join(dir, "agent.ts")];
  if (await exists(path.join(dir, "connections.ts"))) files.push(path.join(dir, "connections.ts"));
  const toolsDir = path.join(dir, "tools");
  if (await exists(toolsDir)) {
    for (const entry of (await fs.readdir(toolsDir)).sort()) {
      if (entry.endsWith(".ts")) files.push(path.join(toolsDir, entry));
    }
  }
  return files;
}

async function skillsFor(rootDir: string, agentId: string): Promise<string[]> {
  const skillsDir = path.join(rootDir, "agents", agentId, "skills");
  if (!(await exists(skillsDir))) return [];
  const entries = await fs.readdir(skillsDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function ident(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}

async function generateEntry(rootDir: string, agentIds: string[]): Promise<string> {
  const lines: string[] = [
    `export { renderAgent } from "@wzrdtech/zap-agent";`,
    `import projectDef from "./project.ts";`,
    `export const project = projectDef;`,
  ];
  const entries: string[] = [];
  for (const agentId of agentIds) {
    const files = await agentModuleFiles(rootDir, agentId);
    const names: string[] = [];
    files.forEach((file, index) => {
      const name = `m_${ident(agentId)}_${index}`;
      const specifier = `./${path.relative(rootDir, file).split(path.sep).join("/")}`;
      lines.push(`import * as ${name} from ${JSON.stringify(specifier)};`);
      names.push(name);
    });
    entries.push(`  ${JSON.stringify(agentId)}: { modules: [${names.join(", ")}] }`);
  }
  lines.push(`export const agentModules = {`, entries.join(",\n"), `};`);
  return lines.join("\n");
}

interface BundleNamespace {
  [key: string]: unknown;
}

interface LoadedBundle {
  project?: { agents?: Record<string, unknown> };
  agentModules: Record<string, { modules: BundleNamespace[] }>;
}

function isAgent(value: unknown): value is Agent {
  return typeof value === "object" && value !== null && (value as { __brand?: string }).__brand === "Agent";
}

function isTool(value: unknown): value is AnyTool {
  return typeof value === "object" && value !== null && (value as { __brand?: string }).__brand === "Tool";
}

function isConnection(value: unknown): value is Connection {
  return typeof value === "object" && value !== null && (value as { __brand?: string }).__brand === "Connection";
}

function isMcpRef(value: unknown): value is McpServerRef {
  return typeof value === "object" && value !== null && (value as { __brand?: string }).__brand === "McpServerRef";
}

export async function loadAgentModulesFromBundle(
  rootDir: string,
  bundlePath: string,
): Promise<Record<string, LoadedAgentModules>> {
  const bundle = (await import(pathToFileURL(bundlePath).href)) as LoadedBundle;
  const loaded: Record<string, LoadedAgentModules> = {};
  for (const [agentId, entry] of Object.entries(bundle.agentModules)) {
    let agent: Agent | undefined;
    const tools = new Map<string, AnyTool>();
    const connections = new Map<string, Connection["definition"]>();
    const mcpServers = new Map<string, McpServerRef["definition"]>();
    for (const namespace of entry.modules) {
      for (const value of Object.values(namespace)) {
        if (isAgent(value)) agent = value;
        else if (isTool(value)) tools.set(value.definition.name, value);
        else if (isConnection(value)) connections.set(value.definition.id, value.definition);
        else if (isMcpRef(value)) mcpServers.set(value.definition.id, value.definition);
      }
    }
    if (!agent) {
      throw new AgentCodeError("ZAP_BUILD_NO_AGENT", `agents/${agentId}/agent.ts has no default agent export.`);
    }
    const agentSource = await fs.readFile(path.join(rootDir, "agents", agentId, "agent.ts"), "utf8");
    loaded[agentId] = {
      agent,
      tools: [...tools.values()],
      connections: [...connections.values()],
      mcpServers: [...mcpServers.values()],
      subagents: scanHookIds(agentSource, "useSubagent"),
      skills: await skillsFor(rootDir, agentId),
    };
  }
  return loaded;
}

export async function buildProject(options: BuildProjectOptions): Promise<BuildProjectResult> {
  const rootDir = path.resolve(options.rootDir);
  if (!options.skipLint) {
    const lint = await lintProject({ rootDir });
    if (lint.errors.length > 0) {
      const error = new AgentCodeError(
        "ZAP_BUILD_FAILED",
        `lint failed: ${lint.errors.map((issue) => issue.code).join(", ")}`,
      );
      (error as AgentCodeError & { errors: typeof lint.errors }).errors = lint.errors;
      throw error;
    }
  }

  const agentIds = await listAgentDirs(rootDir);
  await fs.mkdir(options.outDir, { recursive: true });
  const entrySource = await generateEntry(rootDir, agentIds);
  // the entry lives in rootDir so bare imports resolve from the project tree
  const entryPath = path.join(rootDir, ".zap-entry.gen.ts");
  await fs.writeFile(entryPath, entrySource);
  const bundlePath = path.join(options.outDir, "bundle.mjs");
  try {
    await esbuild({
      entryPoints: [entryPath],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node24",
      outfile: bundlePath,
      external: ["@wzrdtech/*"],
      sourcemap: false,
      logLevel: "silent",
      absWorkingDir: rootDir,
    });
  } finally {
    await fs.rm(entryPath, { force: true });
  }

  const bytes = await fs.readFile(bundlePath);
  const bundleSha = createHash("sha256").update(bytes).digest("hex");

  const loaded = await loadAgentModulesFromBundle(rootDir, bundlePath);
  const manifest: DeploymentManifest = {
    project: options.projectName ?? path.basename(rootDir),
    agents: Object.fromEntries(
      Object.entries(loaded).map(([agentId, modules]) => [agentId, manifestEntryFor(modules)]),
    ),
    bundleSha,
    builtAt: new Date().toISOString(),
    pins: {},
  };
  await fs.writeFile(path.join(options.outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, bundlePath, bundleSha, errors: [] };
}
