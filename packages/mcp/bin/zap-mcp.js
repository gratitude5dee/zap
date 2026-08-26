#!/usr/bin/env node
// @ts-check
// zap-mcp [--http] [--host <host>] [--port <port>]
// Default transport is stdio; --http serves Streamable HTTP on 127.0.0.1
// unless --host is given (non-loopback hosts require ZAP_MCP_TOKEN).
import { startZapMcpServer } from "../src/server.js";
import { startZapMcpHttpServer } from "../src/http.js";

const args = process.argv.slice(2);

if (args.includes("--http")) {
  /** @param {string} flag */
  const flagValue = (flag) => {
    const index = args.indexOf(flag);
    return index !== -1 ? args[index + 1] : undefined;
  };
  const host = flagValue("--host");
  const portValue = flagValue("--port");
  const handle = await startZapMcpHttpServer({
    ...(host !== undefined ? { host } : {}),
    ...(portValue !== undefined ? { port: Number(portValue) } : {}),
  });
  console.error(`zap-mcp http listening on ${handle.url}`);
} else {
  await startZapMcpServer();
}
