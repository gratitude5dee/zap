import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { describe, expect, it } from "vitest";
import {
  MCP_CONFIG_FORMATS,
  renderMcpFragment,
  type McpServerFragment,
} from "../packages/runtime/src/apistore/fragments";
import { context7McpServer } from "../packages/runtime/src/apistore/context7";
import { composioMcpServer } from "../packages/runtime/src/apistore/composio";
import {
  OPEN_CONNECTOR_MCP_URL,
  openConnectorMcpServer,
  openConnectorUnit,
} from "../packages/runtime/src/apistore/open-connector";
import catalog from "../packages/runtime/src/apistore/catalog.json";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentPluginDoc = readFileSync(path.join(repoRoot, "docs", "agent-plugin.md"), "utf8");

describe("agent-plugin snippets", () => {
  const fences = [...agentPluginDoc.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((match) => ({
    body: match[2],
    lang: match[1],
  }));

  it("has snippets for every documented harness", () => {
    for (const name of ["Claude Code", "Codex", "Cursor", "OpenCode", "Hermes", "OpenClaw"]) {
      expect(agentPluginDoc, `${name} snippet documented`).toContain(name);
    }
    expect(fences.length).toBeGreaterThanOrEqual(6);
  });

  it("every JSON snippet parses and references the zap mcp command", () => {
    const jsonFences = fences.filter((fence) => fence.lang === "json");
    expect(jsonFences.length).toBeGreaterThanOrEqual(3);
    for (const fence of jsonFences) {
      expect(() => JSON.parse(fence.body), fence.body.slice(0, 60)).not.toThrow();
    }
    const referencing = jsonFences.filter((fence) => fence.body.includes("@wzrdtech/zap"));
    expect(referencing.length).toBeGreaterThanOrEqual(3);
  });

  it("every YAML and TOML snippet parses", () => {
    for (const fence of fences.filter((candidate) => candidate.lang === "yaml")) {
      expect(parseDocument(fence.body).errors).toEqual([]);
    }
    for (const fence of fences.filter((candidate) => candidate.lang === "toml")) {
      expect(fence.body).toMatch(/\[[^\]]+\]/);
      expect(fence.body).toMatch(/=/);
    }
  });

  it("npx @wzrdtech/zap mcp is resolvable from the packaged CLI", () => {
    const cliManifest = JSON.parse(readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8")) as {
      bin?: Record<string, string>;
      name: string;
    };
    expect(cliManifest.name).toBe("@wzrdtech/zap");
    expect(cliManifest.bin?.zap).toBeDefined();
  });

  it(".claude-plugin/plugin.json points mcpServers at npx @wzrdtech/zap mcp", () => {
    const plugin = JSON.parse(readFileSync(path.join(repoRoot, ".claude-plugin", "plugin.json"), "utf8")) as {
      mcpServers: Record<string, { args: string[]; command: string }>;
      name: string;
    };
    const server = plugin.mcpServers.zap;
    expect(server.command).toBe("npx");
    expect(server.args.join(" ")).toContain("@wzrdtech/zap");
    expect(server.args.at(-1)).toBe("mcp");
  });
});

describe("API store MCP config fragments", () => {
  const servers: McpServerFragment[] = [context7McpServer(), openConnectorMcpServer(), composioMcpServer({
    headers: { "x-composio-session": "${COMPOSIO_MCP_SESSION}" },
    url: "https://mcp.composio.dev/sessions/example",
  })];

  it("renders every harness mcpConfig format for every API store server", () => {
    expect([...MCP_CONFIG_FORMATS]).toEqual(["yaml", "json", "json5", "toml", "cli"]);
    for (const server of servers) {
      for (const format of MCP_CONFIG_FORMATS) {
        const fragment = renderMcpFragment(format, server);
        expect(fragment.length, `${server.id} ${format}`).toBeGreaterThan(0);
        if (server.url) expect(fragment).toContain(server.url);
        if (format === "json" || format === "json5") {
          const parsed = JSON.parse(fragment) as { mcpServers: Record<string, { url?: string }> };
          expect(parsed.mcpServers[server.id]).toBeDefined();
        }
        if (format === "yaml") expect(parseDocument(fragment).errors).toEqual([]);
        if (format === "toml") expect(fragment).toContain(`[mcp_servers.${server.id}]`);
        if (format === "cli") expect(fragment).toContain(server.id);
      }
    }
  });

  it("never embeds a secret value in a fragment", () => {
    const context7 = context7McpServer();
    for (const format of MCP_CONFIG_FORMATS) {
      const fragment = renderMcpFragment(format, context7);
      expect(fragment).toContain("CONTEXT7_API_KEY");
      expect(fragment).not.toMatch(/ctx7sk|sk-[A-Za-z0-9]/);
    }
  });

  it("context7 registers the hosted MCP endpoint", () => {
    const server = context7McpServer();
    expect(server.url).toBe("https://mcp.context7.com/mcp");
  });

  it("open-connector binds loopback only", () => {
    expect(OPEN_CONNECTOR_MCP_URL).toBe("http://127.0.0.1:3000/mcp");
    expect(openConnectorMcpServer().url).toBe(OPEN_CONNECTOR_MCP_URL);
    const unit = openConnectorUnit();
    expect(unit).toContain("127.0.0.1");
    expect(unit).not.toContain("0.0.0.0");
    expect(unit).not.toMatch(/OOMOL_CONNECT_(ENCRYPTION_KEY|RUNTIME_TOKEN)=[A-Za-z0-9]/);
  });
});

describe("API catalog", () => {
  const entries = catalog as Array<{ id: string; kinds: string[]; name: string; via: string }>;
  const catalogDoc = readFileSync(path.join(repoRoot, "docs", "catalog.md"), "utf8");

  it("ships ~80 typed catalog entries", () => {
    expect(entries.length).toBeGreaterThanOrEqual(75);
    const ids = new Set<string>();
    for (const entry of entries) {
      expect(entry.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(ids.has(entry.id), `${entry.id} unique`).toBe(false);
      ids.add(entry.id);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.kinds.length).toBeGreaterThan(0);
      expect(["composio", "open-connector", "context7", "first-party"]).toContain(entry.via);
    }
  });

  it("docs/catalog.md lists every catalog API with its via", () => {
    for (const entry of entries) {
      expect(catalogDoc, `${entry.id} listed`).toContain(`\`${entry.id}\``);
      expect(catalogDoc).toContain(entry.via);
    }
  });
});
