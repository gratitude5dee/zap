# CLI Reference

The publishable package is `@zap-md/cli`; it exposes the `zap` binary.

## Commands

- `zap init <dir>` creates a lightweight Zap project.
- `zap new <slug>` scaffolds `agent/skills/zap-<slug>`.
- `zap validate [Zap.md]` validates recipe frontmatter and variable references.
- `zap lint [Zap.md]` checks policy warnings such as live provider defaults.
- `zap run <Zap.md>` performs a mock run by default.
- `zap run <Zap.md> --live` plans live provider spend.
- `zap status [runId]` reads local `.zap/runs`.
- `zap docs [topic]` prints bundled docs.
- `zap skills` generates `skills/skills-manifest.json`.
- `zap doctor` checks Node, project files, Convex, Upstash, Supabase, and optional HyperFrames.

## Safety Defaults

CLI runs are mock unless `--live` is provided. Telemetry is off unless the user explicitly runs `zap telemetry on`.
