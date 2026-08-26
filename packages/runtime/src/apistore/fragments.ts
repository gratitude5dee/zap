// MCP config fragment rendering for every harness `mcpConfig` format (§5.10,
// C10). Fragments reference secrets by env var name only — a secret value
// never appears in a rendered fragment (C6/C15).

export const MCP_CONFIG_FORMATS = ["yaml", "json", "json5", "toml", "cli"] as const;

export type McpConfigFormat = (typeof MCP_CONFIG_FORMATS)[number];

export interface McpServerFragment {
  id: string;
  /** Streamable HTTP endpoint (hosted or loopback). */
  url?: string;
  /** Stdio command, e.g. ["npx", "-y", "@wzrdtech/zap", "mcp"]. */
  command?: string[];
  /** Header names → `${ENV_VAR}` references, never literal secret values. */
  headers?: Record<string, string>;
}

/** Renders one MCP server registration in the given harness config format. */
export function renderMcpFragment(format: McpConfigFormat, server: McpServerFragment): string {
  switch (format) {
    case "json":
    case "json5":
      return `${JSON.stringify({ mcpServers: { [server.id]: fragmentBody(server) } }, null, 2)}\n`;
    case "yaml":
      return renderYaml(server);
    case "toml":
      return renderToml(server);
    case "cli":
      return renderCli(server);
  }
}

function fragmentBody(server: McpServerFragment): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (server.url) {
    body.type = "http";
    body.url = server.url;
  }
  if (server.command) {
    body.command = server.command[0];
    body.args = server.command.slice(1);
  }
  if (server.headers && Object.keys(server.headers).length > 0) body.headers = server.headers;
  return body;
}

function renderYaml(server: McpServerFragment): string {
  const lines = [`mcp_servers:`, `  ${server.id}:`];
  if (server.url) {
    lines.push(`    type: http`, `    url: ${JSON.stringify(server.url)}`);
  }
  if (server.command) {
    lines.push(`    command: ${JSON.stringify(server.command[0])}`);
    const args = server.command.slice(1);
    if (args.length > 0) {
      lines.push(`    args:`);
      for (const arg of args) lines.push(`      - ${JSON.stringify(arg)}`);
    }
  }
  if (server.headers && Object.keys(server.headers).length > 0) {
    lines.push(`    headers:`);
    for (const [key, value] of Object.entries(server.headers)) lines.push(`      ${key}: ${JSON.stringify(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderToml(server: McpServerFragment): string {
  const lines = [`[mcp_servers.${server.id}]`];
  if (server.url) {
    lines.push(`type = "http"`, `url = ${JSON.stringify(server.url)}`);
  }
  if (server.command) {
    lines.push(`command = ${JSON.stringify(server.command[0])}`);
    lines.push(`args = [${server.command.slice(1).map((arg) => JSON.stringify(arg)).join(", ")}]`);
  }
  if (server.headers && Object.keys(server.headers).length > 0) {
    lines.push(`[mcp_servers.${server.id}.headers]`);
    for (const [key, value] of Object.entries(server.headers)) lines.push(`${JSON.stringify(key)} = ${JSON.stringify(value)}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderCli(server: McpServerFragment): string {
  const parts = ["mcp", "add", server.id];
  if (server.url) parts.push("--transport", "http", server.url);
  for (const [key, value] of Object.entries(server.headers ?? {})) parts.push("--header", `${key}: ${value}`);
  if (server.command) parts.push("--", ...server.command);
  return `${parts.join(" ")}\n`;
}
