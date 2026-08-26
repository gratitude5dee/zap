export const OPENVIKING_MCP_URL = "http://127.0.0.1:1933/mcp";

export type HarnessMcpFormat = "hermes" | "openclaw" | "opencode" | "interpreter" | "cursor" | "pi" | "fx";

export interface McpFragment {
  format: HarnessMcpFormat;
  kind: "yaml" | "json" | "toml" | "command";
  /** file the fragment merges into, relative to the harness home when set */
  path?: string;
  fragment: string;
}

export interface McpFragmentOptions {
  name?: string;
  url?: string;
}

/** Config fragment registering the loopback OpenViking MCP server with a harness. */
export function mcpRegistrationFragment(format: HarnessMcpFormat, options: McpFragmentOptions = {}): McpFragment {
  const name = options.name ?? "openviking";
  const url = options.url ?? OPENVIKING_MCP_URL;

  switch (format) {
    case "hermes":
      return {
        format,
        kind: "yaml",
        path: "~/.hermes/config.yaml",
        fragment: `mcp_servers:\n  ${name}:\n    url: ${url}\n    enabled: true\n`,
      };
    case "openclaw":
      return {
        format,
        kind: "json",
        path: "~/.openclaw/openclaw.json",
        fragment: JSON.stringify({ mcp: { servers: { [name]: { url } } } }, null, 2),
      };
    case "opencode":
      return {
        format,
        kind: "json",
        path: "~/.config/opencode/opencode.json",
        fragment: JSON.stringify({ mcp: { [name]: { type: "remote", url } } }, null, 2),
      };
    case "interpreter":
      return {
        format,
        kind: "toml",
        path: "~/.config/open-interpreter/config.toml",
        fragment: `[mcp_servers.${name}]\nurl = "${url}"\n`,
      };
    case "cursor":
      return {
        format,
        kind: "json",
        path: ".cursor/mcp.json",
        fragment: JSON.stringify({ mcpServers: { [name]: { url } } }, null, 2),
      };
    case "pi":
      return {
        format,
        kind: "json",
        path: `~/.pi/extensions/${name}/mcp.json`,
        fragment: JSON.stringify({ mcpServers: { [name]: { url } } }, null, 2),
      };
    case "fx":
      return {
        format,
        kind: "command",
        fragment: `/mcp add --transport http ${name} ${url}`,
      };
  }
}
