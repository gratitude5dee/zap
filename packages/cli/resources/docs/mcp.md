# MCP

Zap ships an MCP stdio server so agents can validate, plan, deploy, import, and inspect recipes without scraping terminal output.

## Start the server

```bash
npx @wzrdtech/zap@0.3.1 mcp
```

Standalone usage is also available:

```bash
npx @wzrdtech/zap-mcp@0.3.0
```

When run from `zap mcp`, the server uses the same local CLI binary and local auth stores as the rest of Zap. Standalone installs look for `ZAP_CLI_BIN`, then a local `zap` binary, then `zap` on `PATH`.

## Client config

```json
{
  "mcpServers": {
    "zap": {
      "command": "npx",
      "args": ["@wzrdtech/zap@0.3.1", "mcp"]
    }
  }
}
```

## Tools

- `zap_validate`: validate a Zap.md path or inline Zap markdown.
- `zap_lint`: run recipe policy checks.
- `zap_run`: plan by default, or live-run with existing local credentials.
- `zap_status`: read local run state.
- `zap_keys_list`: list masked local key metadata.
- `zap_gallery_list`: list local or hosted gallery recipes.
- `zap_deploy`: upload a draft and optionally finalize it.
- `zap_import_hyperframes`: import HyperFrames registry templates.
- `zap_import_openmontage`: import OpenMontage pipeline templates.
- `zap_docs`: read bundled Zap documentation.

The MCP server never exposes secret values and does not provide a key-writing tool. Live runs inherit the same budget checks, provider adapters, and credential ladder as `zap run --live`.
