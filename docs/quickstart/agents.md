# Agent Quickstart

Point your coding agent at the Zap project URL or repo, then ask it to install or read the Zap skills before editing recipes.

## Codex

```text
Use the Zap skills from https://zap.wzrd.tech/quickstart and validate with:
npx @zap-md/cli validate
npx @zap-md/cli run agent/skills/zap-world-cup-entrance/Zap.md --json
```

## Claude Code

```text
Read AGENTS.md, then use skills/zap-authoring/SKILL.md before editing any Zap.md recipe.
Run zap validate and zap lint before committing.
```

## Cursor

```text
Use Zap.md frontmatter as the source of truth. Keep prompt files under the same skill directory.
Default to provider: mock until the user asks for live spend.
```

## OpenClaw and Hermes

```text
Treat each agent/skills/zap-*/ directory as a portable capability.
Use docs/reference/schema.md for recipe fields and docs/reference/cli.md for command behavior.
```
