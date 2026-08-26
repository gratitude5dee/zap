# Zap

Zap v5 is a composable CPU agent runtime: compose a runtime (light | med | heavy)
on a Box VM, write agents as code, run them plan-only by default, and pay with
your own keys (BYOK) or per request (managed wallet).

- npm: https://www.npmjs.com/package/@wzrdtech/zap
- docs: https://zap.wzrd.tech/docs
- agents: https://zap.wzrd.tech/llms.txt

## How it works

- **Agents compose runtime plugins.** A runtime is a plugin graph declared in
  `Runtime.md`; `zap compose` resolves the graph and boots it on a sandbox.
- **CPU work runs in tenant sandboxes.** Every command goes through
  `sandbox.exec` on an isolated Box VM (`noEnv: true`); Namespace, self-host,
  microsandbox, E2B, Daytona, Cloudflare, Modal (GPU lane), and Docker adapters
  share one contract.
- **Plan-only is the default.** Side-effecting tools emit `tool.planned` with
  price estimates; nothing spends without `--live` **and** a payer. A missing
  payer fails closed with `PAYER_MISSING`.
- **The gateway owns provider keys.** LLM and media provider keys stay
  server-side; they are never copied into managed VMs, bundles, logs, or
  `--json` output.
- **Agents as code.** `agents/<id>/agent.ts` renders the next step's
  instructions; hooks attach a model, tools, MCP servers, and subagents.
  Deployments are immutable and sha-addressed; sessions are durable.

## Quickstart

Zap requires Node 24.x.

```bash
npx @wzrdtech/zap doctor --json
npx @wzrdtech/zap init
npx @wzrdtech/zap compose --weight med --sandbox box --dry-run --json
```

Author and run an agent:

```bash
zap agent new my-agent
zap deploy --watch
zap session --agent my-agent --json "transcode in.mp4 to h264"
```

Every command supports `--json`: humans get text, agents get JSON. MCP:
`npx @wzrdtech/zap mcp` (stdio) or `--http` (loopback by default, token-gated
otherwise).

## Install

```bash
npm install --global @wzrdtech/zap
zap --version
```

Or project-local: `npm install --save-dev @wzrdtech/zap` then
`npm exec -- zap --version`.

## Payments

- **BYOK**: bring your own provider keys; Zap redacts them from all output.
- **Managed**: `zap pay login --managed` provisions a spend-capped wallet;
  live runs are quoted, metered, and settled via x402 / MPP.
- `zap pay status|quote` shows payer mode, caps, and estimates.

## Local development

```bash
nvm use 24
npm install --legacy-peer-deps
npm run dev
```

Checks before shipping behavior changes:

```bash
npm run cli -- validate
npm run cli -- lint
npm test
npm run typecheck
npm run test:regression
npm run evals
```

`npm run evals` is CI-safe: deterministic contracts run, live cases visibly
skip. Live Box/provider evals are opt-in via `npm run evals:live`
(`EVALS_LIVE=1`); they spend real credits and require org-provisioned
credentials.

## Repository layout

- `packages/kernel` — plugin lifecycle, contexts, effects, services, events
- `packages/sandbox` — sandbox provider contract and adapters (Box default)
- `packages/runtime` — agentd, lanes, gateway, harnesses, pay, redaction
- `packages/agent-code` — agents-as-code build, lint, manifests
- `packages/cli` — the `zap` CLI (`@wzrdtech/zap`)
- `packages/templates` — light/med/heavy runtime templates and bake scripts
- `packages/cloud` — control-plane API (runtimes, pay, meter, secrets)
- `agents/`, `project.ts` — canonical agents-as-code example
- `docs/` — published to https://zap.wzrd.tech/docs

## Security

- Secrets are write-only: never in bundles, instructions, logs, events,
  manifests, snapshots, or `--json`.
- Outbound HTTP goes through declared HTTPS connections with manifest
  allowlisting (`SECRET_SCOPE_DENIED` otherwise).
- Security regression suite: `packages/runtime/tests/security/`.
