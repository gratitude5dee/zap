# zap-agents

Use this skill when writing or running Zap agents as code (Z12).

## The split

An agent is a synchronous TypeScript render function: instructions render on
CPU for free; model calls and GPU work are plugins that only run inside the
tenant's runtime VM. Plan-only is the default — side-effecting tools are
planned, never run, until `--live` and a payer are present.

## Layout

```
project.ts              # defineProject: agents, aliases
agents/<id>/agent.ts    # export default defineAgent(() => string)
agents/<id>/tools.ts    # defineTool / defineRecipeTool
agents/<id>/connections.ts  # defineConnection (HTTPS origins, useSecret)
agents/<id>/skills/     # packed into the deployment, served at /zap/skills/<id>/
```

Deployments are immutable, content-addressed by bundle sha under
`/zap/deployments/<sha>/`; aliases (`development`, `production`) are pointers.
Sessions pin the deployment resolved at creation; alias moves never touch
existing sessions.

## Hooks (render-time only, no I/O)

| Hook | Effect |
| --- | --- |
| `useInput()` | current turn input |
| `useModel(id)` | select the model (never calls it) |
| `useTool(tool)` | declare a tool |
| `useMcpServer(ref)` | declare an MCP server |
| `useSubagent(id)` | declare a child agent |
| `useSessionData()` | sync snapshot of durable session data |
| `useSecret(name)` | opaque write-only ref (`bearer(...)` for auth headers) |

## The three commands

- `zap agent render --agent <id> --input "..." --json` — deterministic render.
- `zap deploy --watch` — rebuild + advance the `development` alias only.
- `zap session --agent <id>[@alias] --json "..."` — one turn, JSONL events,
  plan-only unless `--live`.

Secrets: `zap secret set NAME --agent <id> --env <alias> --stdin`. Values never
appear in bundles, manifests, renders, events, or `--json` output.
