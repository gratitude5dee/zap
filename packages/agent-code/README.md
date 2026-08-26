# @wzrdtech/zap-agent

Zap agents as code: `defineAgent`, synchronous hooks, tools, connections, and the deterministic render frame. The agent function renders the next step's instructions; hooks attach a model, tools, MCP servers, subagents, and connections.

```bash
npm install @wzrdtech/zap-agent
```

```ts
// agents/transcode/agent.ts
import { defineAgent, useInput, useModel, useTool } from "@wzrdtech/zap-agent";

export default defineAgent(function Agent() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  useTool("ffmpeg");
  return `Transcode ${input} to h264. Plan first; execute only when live.`;
});
```

Guarantees enforced at build/lint/render time:

- Hooks are synchronous and may be conditional; async agent functions are rejected
- Plan-only by default; live execution requires a payer
- Secrets are write-only via `defineConnection` — reading `process.env`, embedding secret literals, or non-HTTPS connection origins fail the build lint
- Renders are deterministic: same deployment + input → same frame
- Bundles are sha-addressed deployment manifests; a canary secret never appears in instructions, manifests, bundles, transcripts, events, logs, or `--json`

Run with the CLI: `zap agent render --agent <id> --json`, `zap deploy --watch`, `zap session --agent <id> --json "..."`.

Docs: https://zap.wzrd.tech · repo: https://github.com/gratitude5dee/Zap
