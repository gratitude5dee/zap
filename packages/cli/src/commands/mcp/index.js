// @ts-check
import { fileURLToPath } from "node:url";
import { printJson } from "../../lib/output.js";

/** @type {import("../../lib/registry.js").CliCommand} */
export const command = {
  name: "mcp",
  summary: "Start the Zap MCP server (stdio by default, --http for HTTP)",
  usage: "zap mcp [--http [--port 3910]] [--json]",
  async run({ flags }) {
    const tools = [
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
    if (flags.json) {
      printJson({
        package: "@wzrdtech/zap-mcp",
        command: "zap mcp",
        tools,
        transport: flags.http ? "http" : "stdio",
      });
      return;
    }
    process.env.ZAP_CLI_BIN ??= fileURLToPath(new URL("../../../bin/zap.js", import.meta.url));
    const { startZapMcpServer } = await import("@wzrdtech/zap-mcp/server");
    if (flags.http) {
      const port = Number(flags.port ?? process.env.ZAP_MCP_PORT ?? 3910);
      const { createServer } = await import("node:http");
      const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      const httpServer = createServer((request, response) => {
        transport.handleRequest(request, response).catch(() => {
          if (!response.headersSent) response.writeHead(500);
          response.end();
        });
      });
      await new Promise((resolve) => httpServer.listen(port, () => resolve(undefined)));
      console.error(`zap mcp http listening on :${port}`);
      await startZapMcpServer({ transport });
      return;
    }
    await startZapMcpServer();
  },
};
