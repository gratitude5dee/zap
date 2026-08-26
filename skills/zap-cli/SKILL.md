# zap-cli

Use this skill when invoking or extending the Zap CLI.

## Recipe commands

- `zap init <dir>`
- `zap new <slug>`
- `zap validate [Zap.md]`
- `zap lint [Zap.md]`
- `zap run <Zap.md> [--json]` (plan-only by default; `--live` requires a payer)
- `zap doctor [--json]` (reports `payer`: `missing`, `byok`, or `managed`)
- `zap docs [topic]`
- `zap skills`

## Runtime commands

- `zap compose [Runtime.md|zap.config.ts] --dry-run --json` (pure; never acquires)
- `zap runtime <up|down|ps|logs|exec|snapshot|fork|stop|resume|desktop|import-sprite>`
- `zap fs <ls|read|write|rm> <runtime-id> <path>`
- `zap media <ls|info>` and `zap template <ls|show>`
- `zap ffmpeg <preset> <input> <output>` (plan by default; `--live` requires a payer)
- `zap mcp [--http]` and `zap login --provider <id>`

CLI runs are plan-only by default. Use `--live` only after budget and provider-key
checks pass; without a payer, live paths fail with `PAYER_MISSING` and never
silently downgrade to planning.

## Extending the CLI

Add a command domain by dropping `packages/cli/src/commands/<domain>/index.js`
that exports a `command` object (`name`, `summary`, `usage`, `run(ctx)`) — see
`packages/cli/src/lib/registry.js`. No dispatcher edits are needed; run
`node scripts/sync-cli-docs.mjs` afterwards to refresh the docs command list.
Support `--json` and throw `ZapCliError` for structured failures.
