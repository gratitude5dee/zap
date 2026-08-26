import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeBin = process.execPath;
const cliBin = path.join(repoRoot, "packages/cli/bin/zap.js");
const mcpBin = path.join(repoRoot, "packages/mcp/bin/zap-mcp.js");
const serverModule = path.join(repoRoot, "packages/mcp/src/server.js");
const demoZap = "agent/skills/zap-world-cup-entrance/Zap.md";

const EXPECTED_TOOLS = [
  // legacy recipe surface (0.3.1)
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
  // §5.10 composer surface (Z8)
  "zap_compose",
  "zap_runtime_up",
  "zap_runtime_down",
  "zap_runtime_ps",
  "zap_runtime_exec",
  "zap_runtime_snapshot",
  "zap_runtime_fork",
  "zap_fs_list",
  "zap_fs_read",
  "zap_fs_write",
  "zap_sandbox_exec",
  "zap_harness_ls",
  "zap_harness_doctor",
  "zap_pay_status",
  "zap_pay_quote",
  "zap_memory_search",
  "zap_memory_remember",
  "zap_ffmpeg_preset",
  "zap_template_ls",
  "zap_doctor",
];

const READ_ONLY_TOOLS = new Set([
  "zap_validate",
  "zap_lint",
  "zap_status",
  "zap_keys_list",
  "zap_gallery_list",
  "zap_docs",
  "zap_compose",
  "zap_runtime_ps",
  "zap_fs_list",
  "zap_fs_read",
  "zap_harness_ls",
  "zap_harness_doctor",
  "zap_pay_status",
  "zap_pay_quote",
  "zap_memory_search",
  "zap_template_ls",
  "zap_doctor",
]);

async function exportedTools(): Promise<string[]> {
  const { stdout } = await execFileAsync(nodeBin, [
    "--input-type=module",
    "-e",
    `import(${JSON.stringify(pathToFileURL(serverModule).href)}).then((m) => process.stdout.write(JSON.stringify(m.ZAP_MCP_TOOLS)));`,
  ]);
  return JSON.parse(stdout) as string[];
}

describe("Zap MCP server", () => {
  it("advertises the packaged MCP tool surface from zap mcp --json", async () => {
    const { stdout } = await execFileAsync(nodeBin, [cliBin, "mcp", "--json"], { cwd: repoRoot });
    const payload = JSON.parse(stdout);

    expect(payload.package).toBe("@wzrdtech/zap-mcp");
    expect(payload.transport).toBe("stdio");
    const exported = await exportedTools();
    for (const tool of payload.tools as string[]) expect(exported).toContain(tool);
  });

  it("exports every §5.10 tool in ZAP_MCP_TOOLS", async () => {
    const exported = await exportedTools();
    expect(exported).toEqual(expect.arrayContaining(EXPECTED_TOOLS));
  });

  it("lists tools and returns zap_run plan JSON over stdio", async () => {
    const client = startMcpClient();
    try {
      await initialize(client);

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

  it("registers every ZAP_MCP_TOOLS tool with annotations", async () => {
    const exported = await exportedTools();
    const client = startMcpClient();
    try {
      await initialize(client);
      const tools = await client.request("tools/list", {});
      const byName = new Map<string, { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } }>(
        tools.tools.map((tool: { name: string }) => [tool.name, tool]),
      );
      for (const name of exported) {
        const tool = byName.get(name);
        expect(tool, `${name} registered`).toBeDefined();
        const annotations = tool?.annotations ?? {};
        expect(
          annotations.readOnlyHint === true || annotations.destructiveHint === true,
          `${name} carries readOnlyHint or destructiveHint`,
        ).toBe(true);
        if (READ_ONLY_TOOLS.has(name)) {
          expect(annotations.readOnlyHint, `${name} is read-only`).toBe(true);
          expect(annotations.destructiveHint, `${name} is not destructive`).not.toBe(true);
        }
      }
      expect(byName.get("zap_runtime_exec")?.annotations?.destructiveHint).toBe(true);
      expect(byName.get("zap_sandbox_exec")?.annotations?.destructiveHint).toBe(true);
      expect(byName.get("zap_ffmpeg_preset")?.annotations?.destructiveHint).toBe(true);
    } finally {
      await client.close();
    }
  });

  it("zap_keys_list returns masked values only", async () => {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "zap-mcp-keys-"));
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "zap-mcp-keys-fixture", private: true }));
    const secretValue = "zap-test-secret-value-9876";
    await execFileAsync(nodeBin, [cliBin, "keys", "add", "fal", "fal_key", secretValue, "--json"], { cwd: projectDir });

    const client = startMcpClient({ cwd: projectDir });
    try {
      await initialize(client);
      const result = await client.request("tools/call", { arguments: {}, name: "zap_keys_list" });
      const text = result.content[0].text as string;
      expect(text).not.toContain(secretValue);
      const payload = JSON.parse(text);
      expect(payload.secrets[0].last4).toBe(secretValue.slice(-4));
    } finally {
      await client.close();
      await fs.rm(projectDir, { force: true, recursive: true });
    }
  });

  it("zap_runtime_exec with live:true and a missing payer returns PAYER_MISSING", async () => {
    const client = startMcpClient({ env: { ZAP_TEST_PAYER: "missing" } });
    try {
      await initialize(client);
      const result = await client.request("tools/call", {
        arguments: { command: ["echo", "hi"], live: true, runtimeId: "rt_none" },
        name: "zap_runtime_exec",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("PAYER_MISSING");
    } finally {
      await client.close();
    }
  });
});

async function initialize(client: ReturnType<typeof startMcpClient>) {
  await client.request("initialize", {
    capabilities: {},
    clientInfo: { name: "zap-vitest", version: "0.0.0" },
    protocolVersion: "2025-06-18",
  });
  client.notify("notifications/initialized", {});
}

function startMcpClient({ cwd = repoRoot, env = {} }: { cwd?: string; env?: Record<string, string> } = {}) {
  const child = spawn(nodeBin, [mcpBin], {
    cwd,
    env: { ...process.env, ZAP_CLI_BIN: cliBin, ...env },
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
