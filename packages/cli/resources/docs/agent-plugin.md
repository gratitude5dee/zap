# Zap agent plugin

Zap ships as an agent plugin: MCP tools plus a skill set, installable in any harness that speaks MCP. The MCP server is the packaged CLI (`npx -y @wzrdtech/zap mcp`); stdio is the default transport and `--http` serves Streamable HTTP on `127.0.0.1` (a non-loopback bind requires `ZAP_MCP_TOKEN`).

## MCP tool modules

Tools live in auto-registered domain modules: drop `packages/mcp/src/tools/<domain>.js` exporting `toolNames` (string[]) and `register(server)` and the server discovers it — no edits to `server.js`. Existing domains: `recipes`, `compose`, `runtime`, `fs`, `harness`, `pay`, `memory`, `media`, `doctor`. Plan-only is the default; `live: true` calls are payer-gated and return structured `PAYER_MISSING` when no payer is configured.

## Skills store

Skills follow the contract in `packages/core/src/skill-manifest.ts`: YAML frontmatter with `name`, `description`, `version`, optional `metadata.zap.{weight,lanes,harnesses}`. In a runtime the store is `/zap/skills/<name>/SKILL.md`; the store is symlinked/copied into each harness's `skillsDirs` at boot. Hosted downloads: `https://zap.wzrd.tech/api/skills/<name>`.

## Install snippets

### Claude Code

Install the plugin (bundles skills + MCP), or register the MCP server directly in `.mcp.json`:

```json
{
  "mcpServers": {
    "zap": {
      "command": "npx",
      "args": ["-y", "@wzrdtech/zap", "mcp"]
    }
  }
}
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.zap]
command = "npx"
args = ["-y", "@wzrdtech/zap", "mcp"]
```

### Cursor

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "zap": {
      "command": "npx",
      "args": ["-y", "@wzrdtech/zap", "mcp"]
    }
  }
}
```

### OpenCode

`opencode.json`:

```json
{
  "mcp": {
    "zap": {
      "type": "local",
      "command": ["npx", "-y", "@wzrdtech/zap", "mcp"],
      "enabled": true
    }
  }
}
```

### Hermes

`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  zap:
    command: "npx"
    args:
      - "-y"
      - "@wzrdtech/zap"
      - "mcp"
```

### OpenClaw

`~/.openclaw/openclaw.json`:

```json
{
  "mcp": {
    "servers": {
      "zap": {
        "command": "npx",
        "args": ["-y", "@wzrdtech/zap", "mcp"]
      }
    }
  }
}
```

## API store fragments

The `apistore.*` plugins render one MCP registration per harness `mcpConfig` format (`yaml`, `json`, `json5`, `toml`, `cli`) via `renderMcpFragment` in `packages/runtime/src/apistore/fragments.ts`:

- `apistore.context7` — `https://mcp.context7.com/mcp`, header `CONTEXT7_API_KEY: ${CONTEXT7_API_KEY}` (env reference, never a value).
- `apistore.open-connector` — self-hosted `http://127.0.0.1:3000/mcp`, loopback only.
- `apistore.composio` — hosted MCP session URL minted by the control plane (entity = tenant id).

See `docs/catalog.md` for the API catalog and which route (`via`) each API attaches through.
