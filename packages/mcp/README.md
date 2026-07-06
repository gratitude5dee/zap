# @wzrdtech/zap-mcp

MCP stdio server for driving Zap from Codex, Claude Code, Cursor, and other agent clients.

## Usage

```bash
npx @wzrdtech/zap-mcp@0.3.0
```

When launched through the CLI, `zap mcp` sets `ZAP_CLI_BIN` so MCP tools call the same local Zap CLI implementation:

```bash
npx @wzrdtech/zap@0.3.0 mcp
```

Standalone installs look for `ZAP_CLI_BIN`, then a local `node_modules/.bin/zap`, then `zap` on `PATH`.

## Tools

- `zap_validate`
- `zap_lint`
- `zap_run`
- `zap_status`
- `zap_keys_list`
- `zap_gallery_list`
- `zap_deploy`
- `zap_import_hyperframes`
- `zap_import_openmontage`
- `zap_docs`

`zap_keys_list` returns masked key metadata only. Live runs and deploys inherit the caller process environment and the local Zap auth/credential stores.
