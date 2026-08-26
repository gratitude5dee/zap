---
name: zap-runtime
description: Operate Zap runtimes - create, inspect, exec, snapshot, fork, and tear down composed microVM runtimes.
version: 5.0.0-alpha
metadata:
  zap:
    weight: light
    lanes: [codegen]
---

# zap-runtime

Use this skill to drive a composed Zap runtime lifecycle.

## Commands

- `zap runtime up [file] --json` — create a runtime from `Runtime.md` or `zap.config.ts`.
- `zap runtime ps --json` — list tracked runtimes.
- `zap runtime exec <id> -- <command...>` — run a command in the runtime sandbox.
- `zap runtime snapshot <id> [--name <name>]` — snapshot the runtime.
- `zap runtime fork <id>` — fork into a new runtime.
- `zap runtime down <id>` — release the runtime and its sandbox.
- `zap fs <ls|read|write|rm> <id> <path>` — runtime filesystem access.

## Rules

- Plan-only is the default. Live side effects require `--live` plus a configured payer; a missing payer returns `PAYER_MISSING`.
- Never stop a runtime with force; use `zap runtime down`.
- Snapshots and templates must never contain secret values.
- The VM skill store lives at `/zap/skills/<name>/SKILL.md`.
