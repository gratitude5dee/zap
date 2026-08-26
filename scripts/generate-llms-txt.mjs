// @ts-check
// Renders public/llms.txt from the goal.md Appendix C template shape.
// Public surface: names Zap only (C3). Run: node scripts/generate-llms-txt.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const LLMS_TXT = `# Zap — composable CPU agent runtime

> @wzrdtech/zap v5: compose a runtime (light | med | heavy) on a Box VM, write agents as code, run them plan-only by default, pay with your own keys or per request.

npm: https://www.npmjs.com/package/@wzrdtech/zap
repo: https://github.com/gratitude5dee/Zap
docs: https://zap.wzrd.tech/docs

## For agents
- Read this file first. Every CLI command has --json; humans get text, agents get JSON.
- Start: npx @wzrdtech/zap doctor --json, then npx @wzrdtech/zap compose --weight med --sandbox box --dry-run --json.
- Plan-only is the default. --live requires a payer (BYOK key or managed wallet). Nothing spends without it.
- MCP: npx @wzrdtech/zap mcp (stdio) or --http; skills at /api/skills/<skill>.

## Programming model
- An agent is a function that renders the next step's instructions. Hooks attach a model, tools, MCP servers, subagents; hooks are synchronous and may be conditional; the runtime executes.
- Layout: agents/<id>/agent.ts, tools/*.ts, connections.ts, skills/<skill>/SKILL.md, project.ts. Address an agent as <id>@<alias>.
- CPU work runs on the sandbox (sandbox.exec). Outbound HTTP goes through declared HTTPS connections; secrets are write-only and never appear in bundles, instructions, logs or --json.
- Sessions are durable and bound to the deployment they started on. zap deploy --watch syncs development; zap deploy --alias production advances production.

## CLI
- /docs/reference/cli — every command, flags, exit codes, --json shapes
- zap compose · zap runtime up|ps|exec|down · zap agent new|ls|render|lint · zap deploy [--watch|--alias <alias>] · zap session --agent <id>[@alias] [--live] --json "…" · zap secret set|list|remove · zap fs · zap media · zap ffmpeg <preset> · zap memory · zap pay · zap mcp · zap doctor --json

## Agents as code
- /docs/agents — the model, hook table, capabilities, secrets and egress, sessions and deploys
- /docs/agents/quickstart — zap agent new → zap deploy --watch → zap session
- /docs/reference/agent-api — @wzrdtech/zap-agent exports

## Runtime
- /docs/runtime — what a runtime is, weights, lifecycle, self-host and managed modes
- /docs/compose — Runtime.md, profiles, plugin graph
- /docs/isolation — VM, process sandbox, microVM, WASM lanes, GPU lanes
- /docs/mediafs — media file system and ffmpeg presets

## Templates
- /docs/templates/zap-light · zap-light-ffmpeg · zap-light-code · zap-light-browser · zap-med · zap-med-genmedia · zap-med-interpreter · zap-med-fx · zap-heavy · zap-heavy-<harness> · env-omarchy · env-macos (one page per template)

## Providers
- /docs/providers/box · namespace · selfhost · microsandbox · hyperlight · e2b · daytona · cloudflare · modal · docker (sandboxes)
- /docs/providers/openviking · mem0 · zep (memory)
- /docs/providers/openrouter · ai-gateway · openai · anthropic · xai · gmi · fal · prodia · runware · replicate · vertex · aws (gateway)
- /docs/providers/thirdweb · cdp · mpp (pay)
- /docs/providers/context7 · open-connector · composio (API store)

## Harnesses
- /docs/harnesses — the catalog of third-party harness templates a heavy runtime can host, with ports, auth and run adapters

## Pay
- /docs/pay — BYOK, managed x402 / MPP, quotes, meter, caps · /docs/auth — wallet, Claude Code, Codex login

## Kernel and contracts
- /docs/kernel — Context, effects, services, forks, events
- /docs/sandbox-contract — SandboxProvider / SandboxHandle / SandboxSpec / ExecResult
- /docs/agent-plugin — install Zap as a plugin in your coding agent
`;

const target = path.join(repoRoot, "public", "llms.txt");
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, LLMS_TXT);
console.log(`wrote ${path.relative(repoRoot, target)} (${LLMS_TXT.length} bytes)`);
