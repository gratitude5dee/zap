# @wzrdtech/zap-agent

Zap agents as code: `defineAgent`, synchronous hooks, tools, connections, and the deterministic render frame. The agent function renders the next step's instructions; hooks attach a model, tools, MCP servers, subagents, and connections.

```bash
npm install @wzrdtech/zap-agent
```

```ts
// agents/transcode/agent.ts
import { defineAgent, defineTool, useInput, useModel, useTool } from "@wzrdtech/zap-agent";

const transcode = defineTool({
  name: "ffmpeg_transcode",
  description: "Transcode a file on the Zap CPU sandbox",
  input: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  async run({ input, sandbox, signal }) {
    return sandbox.exec(["ffmpeg", "-i", String(input.path), "-y", "/zap/fs/out.mp4"], { signal });
  },
});

export default defineAgent(function Agent() {
  const input = useInput();
  useModel("openrouter/anthropic/claude-sonnet-4.6");
  useTool(transcode);
  return `Do the work. Plan-only unless --live. Request: ${input.text}`;
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
