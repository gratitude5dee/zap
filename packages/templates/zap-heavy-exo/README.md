# zap-heavy-exo

Named snapshot built from `zap-heavy` that builds exo at the pinned `EXO_REF`
and drives it over `http-runs` (`exo agentd`: `POST /v1/runs`, SSE events —
the same contract as Hermes' api_server). The manifest lives at
`packages/runtime/src/harness/exo.ts`.

airv2 invariants: one user/one sandbox, `noEnv`, only `agentd` inbound,
per-sandbox `API_SERVER_KEY`, `exo-host.service` re-registers the 8642
`--private` route after stop → resume.

"zap-heavy" character: the Zap skills store, recipe tooling
(`/zap/exo/zap-tools.mjs` → `recipe:<slug>` tools) and media stack are
mounted for the exo agent.

See `docs/templates/zap-heavy-exo.md` and `docs/harnesses/exo.md`.
