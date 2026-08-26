# Agents quickstart

Build, render, deploy, and talk to your first Zap agent in five minutes.
Everything below is plan-only by default: no model spend, no side effects.

## 1. Scaffold

```text
zap agent new echo
```

This creates `agents/echo/agent.ts` and registers `echo` in `project.ts`.
No `.env` file is created — outbound auth goes through connections and
`zap secret set`, never environment variables.

## 2. Write the render function

```ts
import { defineAgent, useInput, useModel } from "@wzrdtech/zap-agent";

export default defineAgent(function Echo() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  return input.text
    ? `Do the work. Plan-only unless --live. Request: ${input.text}`
    : "You are a Zap CPU agent. Plan first.";
});
```

## 3. Render deterministically (free, no model)

```text
zap agent render --agent echo --input "hello" --json
```

The output shows the exact instructions, model, tools, and referenced secret
names (never values) — identical bytes on every run with the same input.

## 4. Deploy and iterate

```text
zap deploy            # immutable deployment; advances the development alias
zap deploy --watch    # rebuild on change; only ever moves development
```

Promote to production explicitly, by sha:

```text
zap deploy --alias production --sha <deployment-sha>
```

## 5. Talk to it

```text
zap session --agent echo --json "hello world"
```

Events stream as JSONL: `turn.started`, `render`, `text.delta`,
`tool.planned`, `turn.completed`. Resume a durable session with
`--session <id>`; list them with `zap sessions ls`. Side-effecting tools run
only with `--live`, and any model call requires a payer (`PAYER_MISSING`
otherwise).

## 6. Add a connection and a secret

```ts
import { bearer, defineConnection, useSecret } from "@wzrdtech/zap-agent";

export const webhook = defineConnection({
  id: "webhook",
  origin: "https://hooks.example.com",
  methods: ["POST"],
  pathPrefix: "/zap/",
  headers: { Authorization: bearer(useSecret("WEBHOOK_TOKEN")) },
});
```

```text
zap secret set WEBHOOK_TOKEN --agent echo --env development --stdin
```

The value is encrypted at rest, listed as last4 only, resolved just-in-time
per request, and never appears in any artifact.

Next: [Agents as code](../agents.md) for the model, and the
[agent API reference](../reference/agent-api.md).
