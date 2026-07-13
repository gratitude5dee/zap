# CLI Reference

The publishable package is `@wzrdtech/zap`; it exposes the `zap` binary.

## Install and invoke

Use Node 24.x. For one-off commands:

```bash
npx --yes @wzrdtech/zap@0.3.1 --version
```

After a project-local install, invoke the binary with `npm exec` (or from an npm
script). npm does not add `node_modules/.bin` to zsh's global `PATH`:

```bash
npm install --save-dev @wzrdtech/zap@0.3.1
npm exec -- zap --version
```

If you want to type `zap` directly in any directory, install globally:

```bash
npm install --global @wzrdtech/zap@0.3.1
zap --version
```

## Commands

- `zap init <dir>` creates a lightweight Zap project.
- `zap new <slug>` scaffolds `agent/skills/zap-<slug>`.
- `zap validate [Zap.md]` validates recipe frontmatter and variable references.
- `zap lint [Zap.md]` checks policy warnings such as live provider defaults.
- `zap run <Zap.md>` performs a zero-spend plan by default.
- `zap run <Zap.md> --live` submits live provider work with locally stored BYOK keys.
- `zap run <Zap.md> --budget-cap-usd <n>` overrides the recipe spend cap for that run.
- `zap gallery [--remote]` lists local recipes or the hosted gallery.
- `zap keys add/list/test/remove/sync` manages encrypted provider credentials.
- `zap deploy` publishes a Zap bundle to the hosted API.
- `zap finalize <slug>` promotes a deployed draft into the Gallery.
- `zap import hyperframes|openmontage` converts upstream templates into local Zap recipes.
- `zap inspect` and `zap embed` expose non-interactive recipe and embed metadata.
- `zap status [runId]` reads local `.zap/runs`.
- `zap mcp` starts the `@wzrdtech/zap-mcp` stdio server for agent clients.
- `zap improve <slug|Zap.md>` proposes a version bump from Convex run/feedback evidence when `CONVEX_URL` is configured, plus local `.zap` traces as offline evidence.
- `zap docs [topic]` prints bundled docs.
- `zap skills` generates `skills/skills-manifest.json`.
- `zap doctor` checks Node, project files, Convex, Upstash, Supabase, and optional HyperFrames.

## Safety Defaults

CLI runs are plan-only unless `--live` is provided. Telemetry is off unless the user explicitly runs `zap telemetry on`.
