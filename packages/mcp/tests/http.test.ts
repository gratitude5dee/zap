import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { startZapMcpHttpServer } from "../src/http.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const nodeBin = process.execPath;
const cliBin = path.join(repoRoot, "packages/cli/bin/zap.js");
const mcpBin = path.join(repoRoot, "packages/mcp/bin/zap-mcp.js");

type HttpHandle = Awaited<ReturnType<typeof startZapMcpHttpServer>>;

const INITIALIZE = {
  id: 1,
  jsonrpc: "2.0",
  method: "initialize",
  params: {
    capabilities: {},
    clientInfo: { name: "zap-http-vitest", version: "0.0.0" },
    protocolVersion: "2025-06-18",
  },
};

async function postInitialize(url: string, headers: Record<string, string> = {}) {
  return await fetch(url, {
    body: JSON.stringify(INITIALIZE),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

async function readInitializeResult(response: Response) {
  const text = await response.text();
  const line = text.split("\n").find((candidate) => candidate.startsWith("data:")) ?? text;
  return JSON.parse(line.replace(/^data:\s*/, ""));
}

describe("Zap MCP HTTP transport", () => {
  let handle: HttpHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it("refuses a non-loopback bind without ZAP_MCP_TOKEN", async () => {
    await expect(startZapMcpHttpServer({ host: "0.0.0.0", port: 0, token: undefined })).rejects.toThrow(/ZAP_MCP_TOKEN/);
  });

  it("serves MCP over loopback by default without a token", async () => {
    handle = await startZapMcpHttpServer({ port: 0 });
    expect(handle.host).toBe("127.0.0.1");
    const response = await postInitialize(handle.url);
    expect(response.status).toBe(200);
    const message = await readInitializeResult(response);
    expect(message.result.serverInfo.name).toBe("@wzrdtech/zap-mcp");
  });

  it("requires the bearer token when one is configured", async () => {
    handle = await startZapMcpHttpServer({ port: 0, token: "test-token-123" });

    const unauthorized = await postInitialize(handle.url);
    expect(unauthorized.status).toBe(401);
    const unauthorizedBody = await unauthorized.text();
    expect(unauthorizedBody).not.toContain("test-token-123");

    const wrong = await postInitialize(handle.url, { Authorization: "Bearer nope" });
    expect(wrong.status).toBe(401);

    const authorized = await postInitialize(handle.url, { Authorization: "Bearer test-token-123" });
    expect(authorized.status).toBe(200);
    const message = await readInitializeResult(authorized);
    expect(message.result.serverInfo.name).toBe("@wzrdtech/zap-mcp");
  });

  it("keeps stdio as the default transport of the packaged binary", async () => {
    const child = spawn(nodeBin, [mcpBin], {
      cwd: repoRoot,
      env: { ...process.env, ZAP_CLI_BIN: cliBin },
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!child.stdin || !child.stdout) throw new Error("Could not start MCP process.");
    child.stdout.setEncoding("utf8");
    let buffer = "";
    const response = new Promise<Record<string, any>>((resolve) => {
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline !== -1) resolve(JSON.parse(buffer.slice(0, newline)));
      });
    });
    child.stdin.write(`${JSON.stringify(INITIALIZE)}\n`);
    const message = await response;
    expect(message.result.serverInfo.name).toBe("@wzrdtech/zap-mcp");
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => undefined);
  });
});
