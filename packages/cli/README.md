# @wzrdtech/zap

The `zap` CLI: compose a composable CPU agent runtime (light | med | heavy) on an isolated Zap sandbox VM, write agents as code, and run them plan-only by default.

Requires Node 24.x.

```bash
npx @wzrdtech/zap@5.0.0 doctor --json
npx @wzrdtech/zap@5.0.0 init
npx @wzrdtech/zap@5.0.0 compose --weight med --sandbox box --dry-run --json
```

Author, deploy, and run an agent:

```bash
zap agent new my-agent
zap agent render --agent my-agent --json "transcode last night's takes"
zap deploy --watch                 # syncs the development alias
zap deploy --alias production      # advances production
zap session --agent my-agent --json "transcode last night's takes"
```

Every command supports `--json`: humans get text, agents get JSON. Side-effecting work is planned (never executed) unless you pass `--live` **and** a payer is configured — a missing payer fails closed with `PAYER_MISSING`.

Other entry points:

- `zap mcp` — MCP stdio server (`--http` for a loopback HTTP transport)
- `zap harness ls|bake|doctor|run` — named harness templates on zap-heavy
- `zap secret set|ls` — write-only secrets, scope-checked via connections
- `zap pay status|quote|login` — BYOK or managed spend-capped payer
- `zap validate|lint|run` — legacy 0.3.1 recipe commands, preserved

Install options:

```bash
npm install --global @wzrdtech/zap   # shell-wide `zap`
npm install --save-dev @wzrdtech/zap # then: npm exec -- zap --version
```

Docs: https://zap.wzrd.tech · agents: https://zap.wzrd.tech/llms.txt · repo: https://github.com/gratitude5dee/Zap
