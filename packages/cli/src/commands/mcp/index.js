// @ts-check
import { fileURLToPath } from "node:url";
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "mcp",
  summary: "Start the Zap MCP server (stdio by default, --http for HTTP)",
  usage: "zap mcp [--http [--host 127.0.0.1] [--port 3910]] [--json]",
  async run({ flags }) {
    if (flags.json) {
      const { ZAP_MCP_TOOLS } = await import("@wzrdtech/zap-mcp/server");
      printJson({
        package: "@wzrdtech/zap-mcp",
        command: "zap mcp",
        tools: ZAP_MCP_TOOLS,
        transport: flags.http ? "http" : "stdio",
      });
      return;
    }
    process.env.ZAP_CLI_BIN ??= fileURLToPath(new URL("../../../bin/zap.js", import.meta.url));
    if (flags.http) {
      const { startZapMcpHttpServer } = await import("@wzrdtech/zap-mcp/http");
      const handle = await startZapMcpHttpServer({
        ...(typeof flags.host === "string" ? { host: flags.host } : {}),
        ...(flags.port !== undefined ? { port: Number(flags.port) } : {}),
      });
      console.error(`zap mcp http listening on ${handle.url}`);
      return;
    }
    const { startZapMcpServer } = await import("@wzrdtech/zap-mcp/server");
    await startZapMcpServer();
  },
};
