---
name: zap-templates
description: Work with named, forkable Zap runtime templates - list, bake, fork, and pin template facts.
version: 5.0.0-alpha
metadata:
  zap:
    weight: light
---

# zap-templates

Use this skill when working with Zap runtime templates.

## Rules

- Templates are named, forkable microVM images; `zap template ls --json` lists them.
- Template definitions live under `packages/templates/<name>` with bake fragments in `bake.d/*.sh` (numeric prefix orders them).
- Bake scripts pin provider facts (versions, URLs, checksums) and verify them at bake time; record assumptions in `docs/verify-log.md`.
- Templates must never contain secret values; per-box env is injected at boot, not baked.
- `zap-heavy` includes the API store fragment (`bake.d/50-apistore.sh`) which self-hosts the open-connector MCP on loopback.
- Fork a template rather than mutating a shared one.
