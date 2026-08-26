// @ts-check
// Renders public/llms.txt from the goal.md Appendix C template shape.
// Public surface: names Zap only (C3). Run: node scripts/generate-llms-txt.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const version = JSON.parse(
  readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8"),
).version;

const pages = (dir) =>
  readdirSync(path.join(repoRoot, "docs", dir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();

const templateLines = pages("templates")
  .map((slug) => `- /docs/templates/${slug}`)
  .join("\n");
const providerLines = pages("providers")
  .map((slug) => `- /docs/providers/${slug}`)
  .join("\n");
const harnessLines = pages("harnesses")
  .map((slug) => `- /docs/harnesses/${slug}`)
  .join("\n");
const agentLines = pages("agents")
  .map((slug) => `- /docs/agents/${slug}`)
  .join("\n");

const LLMS_TXT = `# Zap v5 — composable CPU agent runtime

> Current package: @wzrdtech/zap@${version}. Requires Node 24.x.
> Zap composes agents, tools, MCP servers, services, and sandbox providers into a CPU runtime (light | med | heavy) on an isolated sandbox VM. Write agents as code; plan-only is the default for side-effecting tools.

Canonical docs: https://docs.zap.wzrd.tech
Full agent index: https://docs.zap.wzrd.tech/llms.txt
npm: https://www.npmjs.com/package/@wzrdtech/zap
repo: https://github.com/gratitude5dee/Zap
local docs (this site): https://zap.wzrd.tech/docs

## For agents
- Read this file first. Every CLI command has --json; humans get text, agents get JSON.
- Safe first run (no sandbox acquired, no live work):
  npx @wzrdtech/zap@${version} doctor --json
  npx @wzrdtech/zap@${version} init my-zap --non-interactive --json
  cd my-zap
  npx @wzrdtech/zap@${version} compose --weight med --sandbox box --dry-run --json
- Plan-only is the default. --live requires a payer (BYOK key or managed wallet). A missing payer fails closed with PAYER_MISSING; read-only tools may run in plan mode and model tokens meter under the payer.
- MCP: npx -y @wzrdtech/zap@${version} mcp (stdio) or --http; skills at /api/skills/<skill>.
- Secrets are write-only, scoped to declared HTTPS connections; they never appear in bundles, instructions, events, or --json output.

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
${agentLines}
- /docs/reference/agent-api — @wzrdtech/zap-agent exports

## Runtime
- /docs/runtime — what a runtime is, weights, lifecycle, self-host and managed modes
- /docs/compose — Runtime.md, profiles, plugin graph
- /docs/isolation — VM, process sandbox, microVM, WASM lanes, GPU lanes
- /docs/mediafs — media file system and ffmpeg presets

## Templates
${templateLines}

## Providers
${providerLines}

## Harnesses
- the catalog of third-party harness templates a heavy runtime can host, with ports, auth and run adapters
${harnessLines}

## Pay
- /docs/pay — BYOK, managed x402 / MPP, quotes, meter, caps · /docs/auth — wallet, Claude Code, Codex login

## Kernel and contracts
- /docs/kernel — Context, effects, services, forks, events
- /docs/sandbox-contract — SandboxProvider / SandboxHandle / SandboxSpec / ExecResult
- /docs/agent-plugin — install Zap as a plugin in your coding agent

## Legacy 0.3.1 (compatible recipes)
- Zap 0.3.1 media recipes remain supported on v5 as a compatibility layer.
- Providers: https://zap.wzrd.tech/providers · Legacy docs: https://docs.zap.wzrd.tech/legacy/introduction
`;

const target = path.join(repoRoot, "public", "llms.txt");
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, LLMS_TXT);
console.log(`wrote ${path.relative(repoRoot, target)} (${LLMS_TXT.length} bytes)`);
