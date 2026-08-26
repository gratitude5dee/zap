# __AGENT_ID__

A Zap agent written as code: a synchronous render function that returns
instructions and declares capabilities with hooks.

- `zap agent render --agent __AGENT_ID__ --input "..." --json` — deterministic render, no model call.
- `zap deploy --watch` — build, lint, and move the `development` alias on change.
- `zap session --agent __AGENT_ID__ --json "..."` — run a plan-only turn (add `--live` to spend).

Outbound auth never reads `process.env`. Declare a connection in
`connections.ts` with `bearer(useSecret("NAME"))`, then set the value with
`zap secret set NAME --agent __AGENT_ID__ --env development`.
