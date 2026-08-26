# zap-heavy-opencode

Named snapshot built from `zap-heavy` that installs `opencode-ai` at the
pinned version and drives it over `http-runs` (`POST /session`,
`/session/:id/message`, SSE `/event`). The manifest lives at
`packages/runtime/src/harness/opencode.ts`.

See `docs/templates/zap-heavy-opencode.md` and `docs/harnesses/opencode.md`.
