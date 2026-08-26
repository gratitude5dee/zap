# Agents as code

A Zap agent is a synchronous TypeScript render function. Instructions render
on CPU for free; model thinking and GPU work are plugins that only run inside
your tenant's runtime VM. Plan-only is the default — side-effecting tools are
planned, never executed, until you pass `--live` with a payer configured.

## The programming model

```ts
import { defineAgent, useInput, useModel, useTool } from "@wzrdtech/zap-agent";
import { transcode } from "./tools";

export default defineAgent(function Agent() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  if (/transcode/i.test(input.text ?? "")) useTool(transcode);
  return input.text
    ? `Do the work. Plan-only unless --live. Request: ${input.text}`
    : "You are a Zap CPU agent. Plan first.";
});
```

The render function runs on every turn, before every model step. Capabilities
(tools, MCP servers, subagents) rebuild from empty on each render, so
conditional hooks work naturally: a tool declared inside an `if` exists only
when the condition holds. Render is strictly synchronous and free of I/O —
`fetch`, timers, `process.env`, and async render functions all throw guard
errors (`AGENT_RENDER_IO`, `AGENT_RENDER_ASYNC`).

`useModel` selects a model; it never calls one. `useTool` declares a tool; it
never runs one. The runtime executes model steps and tool calls after render,
inside the VM, under plan/live gating.

## Deployments, aliases, sessions

`zap deploy` bundles `project.ts` and every `agents/<id>/agent.ts` into an
immutable deployment, content-addressed by bundle sha, stored under
`/zap/deployments/<sha>/` in the runtime VM. Aliases (`development`,
`production`) are movable pointers under `/zap/aliases/`:

- `zap deploy --watch` rebuilds on change and advances **only** `development`.
- `zap deploy --alias production --sha <sha>` moves the production pointer to
  an existing deployment — it never builds a new one.

Sessions are durable and pinned: `zap session --agent transcode@production`
resolves the alias **once**, at session creation, and stores the resolved
`deploymentId` in the session. Later alias moves never change a running
session. Transcripts stay inside the VM under `/zap/sessions/<id>/`; only
metadata (agent, alias, deployment id, turn count) mirrors to the control
plane.

## Plan-only and live

Every turn is plan-only unless `--live` is passed. In plan-only mode,
side-effecting tools emit `tool.planned` events with their input and cost
estimate; read-only tools may run. Model calls spend in both modes, so a
missing payer fails closed with `PAYER_MISSING` before the first model step.

## Secrets and connections

Secrets are write-only references: `useSecret("WEBHOOK_TOKEN")` produces an
opaque ref that only a declared connection can use, and
`bearer(useSecret(...))` builds an auth header from one. Connections declare
an HTTPS origin, an allowed method list, and a path prefix; requests must use
relative paths inside the prefix. Values resolve immediately before the
request, attach only to that request, and are discarded — they never appear in
bundles, manifests, rendered instructions, events, session transcripts, or
`--json` output.

```text
zap secret set WEBHOOK_TOKEN --agent transcode --env production --stdin
zap secret list        # names, scopes, last4 only
```

See [the quickstart](./agents/quickstart.md) to build your first agent and
[the API reference](./reference/agent-api.md) for every hook and type.
