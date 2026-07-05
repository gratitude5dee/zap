# CLI Reference

The publishable package is `@wzrdtech/zap`; it exposes the `zap` binary.

## Commands

- `zap init <dir>` creates a lightweight Zap project.
- `zap new <slug>` scaffolds `agent/skills/zap-<slug>`.
- `zap validate [Zap.md]` validates recipe frontmatter and variable references.
- `zap lint [Zap.md]` checks policy warnings such as live provider defaults.
- `zap run <Zap.md>` performs a zero-spend plan by default.
- `zap run <Zap.md> --live` submits live provider work with locally stored BYOK keys.
- `zap keys add/list/test/remove/sync` manages encrypted provider credentials.
- `zap deploy` publishes a Zap bundle to the hosted API.
- `zap inspect` and `zap embed` expose non-interactive recipe and embed metadata.
- `zap status [runId]` reads local `.zap/runs`.
- `zap improve <slug|Zap.md>` proposes a version bump from Convex run/feedback evidence when `CONVEX_URL` is configured, plus local `.zap` traces as offline evidence.
- `zap docs [topic]` prints bundled docs.
- `zap skills` generates `skills/skills-manifest.json`.
- `zap doctor` checks Node, project files, Convex, Upstash, Supabase, and optional HyperFrames.

## Safety Defaults

CLI runs are plan-only unless `--live` is provided. Telemetry is off unless the user explicitly runs `zap telemetry on`.
