// @ts-check
// Streamable HTTP transport for the Zap MCP server. Binds 127.0.0.1 by
// default; a non-loopback bind is refused unless a bearer token is
// configured (ZAP_MCP_TOKEN). Token comparison is constant-time and the
// token value never appears in responses or logs (C6).
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createZapMcpServer } from "./server.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Starts the Zap MCP server over Streamable HTTP.
 * @param {{ host?: string; port?: number; token?: string }} [options]
 * @returns {Promise<{ close: () => Promise<void>; host: string; port: number; url: string }>}
 */
export async function startZapMcpHttpServer({
  host = "127.0.0.1",
  port = Number(process.env.ZAP_MCP_PORT ?? 3910),
  token = process.env.ZAP_MCP_TOKEN,
} = {}) {
  if (!LOOPBACK_HOSTS.has(host) && !token) {
    throw new Error(`Refusing to bind zap mcp --http to non-loopback host ${host} without ZAP_MCP_TOKEN.`);
  }

  const server = createZapMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = createServer((request, response) => {
    if (token && !isAuthorized(request.headers.authorization, token)) {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized. Send Authorization: Bearer <ZAP_MCP_TOKEN>." }));
      return;
    }
    transport.handleRequest(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });

  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve(undefined));
  });

  const address = httpServer.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : port;
  const urlHost = host.includes(":") ? `[${host}]` : host;
  return {
    async close() {
      await transport.close().catch(() => undefined);
      await new Promise((resolve) => httpServer.close(() => resolve(undefined)));
    },
    host,
    port: boundPort,
    url: `http://${urlHost}:${boundPort}/`,
  };
}

/**
 * @param {string | undefined} header
 * @param {string} token
 */
function isAuthorized(header, token) {
  if (!header || !header.startsWith("Bearer ")) return false;
  const presented = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}
