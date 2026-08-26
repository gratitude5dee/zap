# @wzrdtech/zap-mcp

MCP server for driving Zap from Codex, Claude Code, Cursor, and other agent clients.

## Usage

```bash
npx @wzrdtech/zap@5.0.0 mcp          # stdio
npx @wzrdtech/zap@5.0.0 mcp --http   # HTTP (loopback by default, token-gated otherwise)
```

Standalone: `npx @wzrdtech/zap-mcp@5.0.0`. The server looks for `ZAP_CLI_BIN`, then a local `node_modules/.bin/zap`, then `zap` on `PATH`.

## Tool domains

Tool modules auto-register from `src/tools/<domain>.js`:

- `compose` — plan and boot runtime profiles
- `runtime` — runtime status and lifecycle
- `agents` — render, deploy, and session tools for agents as code
- `fs` / `media` — sandbox filesystem and media FS
- `memory` — memory search and retrieval
- `pay` — payer status and quotes
- `harness` — named harness templates
- `doctor` — environment and adapter checks
- `recipes` — legacy 0.3.1 recipe validate/lint/run

Plan-only is the default for every side-effecting tool; secrets and provider keys are redacted from all tool output.

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap
