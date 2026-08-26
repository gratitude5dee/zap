# zap-heavy-hermes

Named snapshot built from `zap-heavy` that installs Hermes at the pinned
`HERMES_REF` and drives it over `http-runs` (`POST /v1/runs`, SSE events).
The manifest lives at `packages/runtime/src/harness/hermes.ts`.

airv2 invariants: one user/one box, `noEnv`, filesystem memory, only
`api_server` enabled, per-box `API_SERVER_KEY`, `hermes-host.service`
re-registers the 8642/9119 `--private` routes after stop → resume.

See `docs/templates/zap-heavy-hermes.md` and `docs/harnesses/hermes.md`.
