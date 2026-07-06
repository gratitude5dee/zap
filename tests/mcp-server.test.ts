import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeBin = process.execPath;
const cliBin = path.join(repoRoot, "packages/cli/bin/zap.js");
const mcpBin = path.join(repoRoot, "packages/mcp/bin/zap-mcp.js");
const demoZap = "agent/skills/zap-world-cup-entrance/Zap.md";

describe("Zap MCP server", () => {
  it("advertises the packaged MCP tool surface from zap mcp --json", async () => {
    const { stdout } = await execFileAsync(nodeBin, [cliBin, "mcp", "--json"], { cwd: repoRoot });
    const payload = JSON.parse(stdout);

    expect(payload.package).toBe("@wzrdtech/zap-mcp");
    expect(payload.transport).toBe("stdio");
    expect(payload.tools).toEqual([
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
    ]);
  });

  it("lists tools and returns zap_run plan JSON over stdio", async () => {
    const client = startMcpClient();
    try {
      await client.request("initialize", {
        capabilities: {},
        clientInfo: { name: "zap-vitest", version: "0.0.0" },
        protocolVersion: "2025-06-18",
      });
      client.notify("notifications/initialized", {});

      const tools = await client.request("tools/list", {});
      const toolNames = tools.tools.map((tool: { name: string }) => tool.name);
      expect(toolNames).toEqual(expect.arrayContaining(["zap_validate", "zap_run", "zap_docs"]));
      expect(toolNames.length).toBeGreaterThanOrEqual(10);

      const mcpResult = await client.request("tools/call", {
        arguments: { mode: "plan", zapMdPath: demoZap },
        name: "zap_run",
      });
      const mcpPayload = JSON.parse(mcpResult.content[0].text);

      const { stdout } = await execFileAsync(nodeBin, [cliBin, "run", demoZap, "--json"], { cwd: repoRoot });
      const cliPayload = JSON.parse(stdout);

      expect(normalizeRun(mcpPayload)).toEqual(normalizeRun(cliPayload));
    } finally {
      await client.close();
    }
  });
});

function startMcpClient() {
  const child = spawn(nodeBin, [mcpBin], {
    cwd: repoRoot,
    env: { ...process.env, ZAP_CLI_BIN: cliBin },
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (!child.stdin || !child.stdout || !child.stderr) throw new Error("Could not start MCP process.");
  const stdin = child.stdin;

  let nextId = 1;
  let buffer = "";
  const waiters: Array<(message: Record<string, unknown>) => void> = [];
  const messages: Record<string, unknown>[] = [];
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    drainMessages();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  function drainMessages() {
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      const message = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else messages.push(message);
    }
  }

  async function nextMessage() {
    const queued = messages.shift();
    if (queued) return queued;
    if (child.exitCode !== null) throw new Error(`MCP process exited early: ${stderr}`);
    return await new Promise<Record<string, unknown>>((resolve) => waiters.push(resolve));
  }

  return {
    async close() {
      if (child.exitCode !== null) return;
      child.kill("SIGTERM");
      await once(child, "exit").catch(() => undefined);
    },
    notify(method: string, params: Record<string, unknown>) {
      writeMcp(stdin, { jsonrpc: "2.0", method, params });
    },
    async request(method: string, params: Record<string, unknown>) {
      const id = nextId++;
      writeMcp(stdin, { id, jsonrpc: "2.0", method, params });
      while (true) {
        const message = await nextMessage();
        if (message.id !== id) continue;
        if (message.error) throw new Error(JSON.stringify(message.error));
        return message.result as Record<string, any>;
      }
    },
  };
}

function writeMcp(stdin: NodeJS.WritableStream, message: unknown) {
  stdin.write(`${JSON.stringify(message)}\n`);
}

function normalizeRun(payload: Record<string, unknown>) {
  const copy = JSON.parse(JSON.stringify(payload));
  delete copy.runId;
  return copy;
}
