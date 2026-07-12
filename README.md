# zap

Zap is a content-agent framework on Eve for one-click generative media recipes.
Zaps are packaged Eve skills (`agent/skills/zap-<slug>/SKILL.md`) whose
frontmatter describes an executable media pipeline and whose prose/prompt files
give humans and the authoring agent creative context.

## What Ships

- Next.js app mounted with `withEve`.
- Public landing page, docs, quickstart, and gallery.
- `DESIGN.md` visual system for the public site and creator app.
- Creator view at `/zap/world-cup-entrance`.
- Optional thirdweb SIWE in the global header; public browse, search, embeds, and dry-runs require no login.
- Wallet-gated Zap Studio with private authoring, template forks, validation, WZRD Cloud runs, and Sprite deployment.
- Run detail view at `/runs/:runId`.
- Eve tools for running, extending, stitching, judging, and saving Zaps.
- Convex schema/functions for `zaps`, `runs`, `steps`, `assets`, `feedback`, `sprites`, and `cronLogs`.
- Upstash Redis idempotency and provider queue helpers.
- Slack, Telegram, and iMessage bridge channels with one-time wallet linking and plan-only enforcement for unlinked users.
- Vercel Sandbox default with Box, Daytona, E2B, Docker, and Eve auto backends behind one contract.
- Vercel AI Gateway default with direct OpenAI, Anthropic, and OpenRouter LLM routes.
- AWS Bedrock, Vertex AI, GMI Cloud, fal, Prodia, and Runware BYOK adapters behind one deterministic provider router.
- Workspace packages for core schema/planning, provider queues, agent helpers, and the publishable `@wzrdtech/zap`.

## Environment

Copy `.env.example`; it documents public, server-only, channel, Sprite, sandbox, provider, Supabase, Convex, and Upstash variables. At minimum, public deployment needs the Supabase/Convex URLs. Wallet sign-in additionally needs thirdweb, and each optional runtime capability fails closed until its own server credentials exist.

Public gallery, docs, quickstart, recipe pages, registry search, and plan-only runs are open. Studio and WZRD Cloud spend require a thirdweb-authenticated Supabase wallet session. BYOK CLI and self-hosted live runs do not require thirdweb.
Provider webhook callbacks are public so hosted providers can report completion;
poll drain uses `ZAP_POLL_DRAIN_SECRET`, and Eve operational endpoints accept
Supabase sessions, Vercel OIDC, local dev, or `ZAP_AGENT_TOKEN`.

## Local Development

Eve expects Node 24.x. This repository records that in `package.json`; install or
activate Node 24 before running:

```bash
npm install
npm run convex:codegen
npm run dev
```

Useful checks:

```bash
npm run cli -- doctor
npm run cli -- validate
npm run cli -- run agent/skills/zap-world-cup-entrance/Zap.md --json
npm run typecheck
npm test
npm run eve:info
npm run eve:build
npm run evals
npm run test:sandboxes
```

Live provider smoke tests are opt-in only. CLI and web runs default to plan-only mode
unless explicit credentials and a live run are requested.
