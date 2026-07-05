# Zap Agent App

This project uses the Eve framework. Before writing Eve code, read the relevant guide in `node_modules/eve/docs/`.

## Zap Rules

- A Zap recipe lives in `agent/skills/zap-<slug>/` with `SKILL.md`, `Zap.md`, and prompt files.
- `Zap.md` frontmatter is the source of truth for inputs, budgets, provider defaults, steps, repeats, and output.
- Default every new recipe and demo run to dry-run planning. Live provider spend requires an explicit user request.
- Run `npm run cli -- validate`, `npm run cli -- lint`, `npm test`, and `npm run typecheck` before shipping behavior changes.
- Use `skills/zap-authoring/SKILL.md` before editing recipes and `skills/zap-providers/SKILL.md` before touching provider adapters or polling.

## Packages

- `packages/core`: schema, parser, planning, and skills manifest helpers.
- `packages/providers`: provider adapter and Upstash queue primitives.
- `packages/agent`: reusable agent instructions and budget guards.
- `packages/cli`: publishable `@wzrdtech/zap` package with the `zap` binary.
