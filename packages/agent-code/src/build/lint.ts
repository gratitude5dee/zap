// Build-time lint (C15/C16): secret literals, HTTPS-only origins, process.env
// bans, async agents, and undeclared subagent/MCP references.
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildProject, loadAgentModulesFromBundle } from "./bundle.ts";

export interface LintIssue {
  code: string;
  file: string;
  message: string;
}

export interface LintProjectOptions {
  rootDir: string;
}

const SENSITIVE_HEADER = /auth|token|key|secret|cookie|password/i;

export function scanHookIds(source: string, hook: "useSubagent" | "useMcpServer"): string[] {
  const ids = new Set<string>();
  const pattern = new RegExp(`${hook}\\s*\\(\\s*["'\`]([^"'\`]+)["'\`]`, "g");
  for (const match of source.matchAll(pattern)) {
    const id = match[1];
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

async function walkTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkTsFiles(target)));
    else if (entry.name.endsWith(".ts")) out.push(target);
  }
  return out;
}

export async function lintProject(options: LintProjectOptions): Promise<{ errors: LintIssue[] }> {
  const rootDir = path.resolve(options.rootDir);
  const issues = new Map<string, LintIssue>();
  const add = (code: string, file: string, message: string): void => {
    issues.set(`${code}:${file}`, { code, file: path.relative(rootDir, file), message });
  };

  const agentFiles = await walkTsFiles(path.join(rootDir, "agents"));
  for (const file of agentFiles) {
    const source = await fs.readFile(file, "utf8");
    if (/process\.env/.test(source)) {
      add("ZAP_BUILD_PROCESS_ENV", file, "agent and tool code must not read process.env; use connections.");
    }
    if (path.basename(file) === "agent.ts" && /defineAgent\s*\(\s*async/.test(source)) {
      add("ZAP_BUILD_ASYNC_AGENT", file, "the agent function must be synchronous.");
    }
  }

  // value checks: load the built modules (names and shapes only)
  await fs.mkdir(path.join(rootDir, ".zap"), { recursive: true });
  const outDir = await fs.mkdtemp(path.join(rootDir, ".zap", "lint-"));
  try {
    const built = await buildProject({ rootDir, outDir, skipLint: true });
    const loaded = await loadAgentModulesFromBundle(rootDir, built.bundlePath);
    const agentIds = new Set(Object.keys(loaded));
    for (const [agentId, modules] of Object.entries(loaded)) {
      const agentFile = path.join(rootDir, "agents", agentId, "agent.ts");
      const connectionsFile = path.join(rootDir, "agents", agentId, "connections.ts");
      if ((modules.agent.render as { constructor: { name: string } }).constructor.name === "AsyncFunction") {
        add("ZAP_BUILD_ASYNC_AGENT", agentFile, "the agent function must be synchronous.");
      }
      for (const def of modules.connections) {
        if (!String(def.origin).startsWith("https://")) {
          add("ZAP_BUILD_ORIGIN_NOT_HTTPS", connectionsFile, `connection ${def.id} origin must be https://.`);
        }
        for (const [name, value] of Object.entries(def.headers ?? {})) {
          const sensitive = SENSITIVE_HEADER.test(name) || (def.sensitiveHeaders ?? []).includes(name);
          if (sensitive && typeof value === "string") {
            add(
              "ZAP_BUILD_SECRET_LITERAL",
              connectionsFile,
              `connection ${def.id} header ${name} is a literal; use useSecret()/bearer().`,
            );
          }
        }
      }
      for (const def of modules.mcpServers) {
        if (def.url !== undefined && !String(def.url).startsWith("https://")) {
          add("ZAP_BUILD_ORIGIN_NOT_HTTPS", connectionsFile, `mcp server ${def.id} url must be https://.`);
        }
        for (const [name, value] of Object.entries(def.headers ?? {})) {
          const sensitive = SENSITIVE_HEADER.test(name) || (def.sensitiveHeaders ?? []).includes(name);
          if (sensitive && typeof value === "string") {
            add(
              "ZAP_BUILD_SECRET_LITERAL",
              connectionsFile,
              `mcp server ${def.id} header ${name} is a literal; use useSecret().`,
            );
          }
        }
      }
      const agentSource = await fs.readFile(agentFile, "utf8");
      for (const subagentId of scanHookIds(agentSource, "useSubagent")) {
        if (!agentIds.has(subagentId)) {
          add("ZAP_BUILD_UNDECLARED_SUBAGENT", agentFile, `useSubagent("${subagentId}") is not a project agent.`);
        }
      }
      const declaredMcp = new Set(modules.mcpServers.map((def) => def.id));
      for (const mcpId of scanHookIds(agentSource, "useMcpServer")) {
        if (!declaredMcp.has(mcpId)) {
          add("ZAP_BUILD_UNDECLARED_MCP", agentFile, `useMcpServer("${mcpId}") is not declared in connections.ts.`);
        }
      }
    }
  } catch (error) {
    add("ZAP_BUILD_FAILED", path.join(rootDir, "project.ts"), (error as Error).message);
  } finally {
    await fs.rm(outDir, { recursive: true, force: true });
  }

  return { errors: [...issues.values()] };
}
