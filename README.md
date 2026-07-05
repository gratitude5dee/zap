# Zap

Zap is a content-agent framework on Eve for 1-click generative video recipes. A
Zap is a packaged Eve skill (`agent/skills/zap-<slug>/SKILL.md`) whose
frontmatter describes an executable media pipeline and whose prose/prompt files
give humans and the authoring agent creative context.

## What Ships

- Next.js app mounted with `withEve`.
- Public landing page, docs, quickstart, and gallery.
- `DESIGN.md` visual system for the public site and creator app.
- Creator view at `/zap/world-cup-entrance`.
- Dev/agent view at `/studio`.
- Run detail view at `/runs/:runId`.
- Eve tools for running, extending, stitching, judging, and saving Zaps.
- Convex schema/functions for `zaps`, `runs`, `steps`, `assets`, `feedback`, and
  `cronLogs`.
- Upstash Redis idempotency and provider queue helpers.
- GMI Cloud, fal, Prodia, and Runware BYOK adapters behind one deterministic provider router.
- Workspace packages for core schema/planning, provider queues, agent helpers, and the publishable `@wzrdtech/zap`.

## Environment

Copy `.env.example` and fill production values in Vercel/Convex:

```bash
GMI_API_KEY=
GMI_ORG_ID=
FAL_KEY=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BLOB_READ_WRITE_TOKEN=
NEXT_PUBLIC_CONVEX_URL=
CONVEX_URL=
AI_GATEWAY_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_THIRDWEB_CLIENT_ID=
ZAP_POLL_DRAIN_URL=
ZAP_POLL_DRAIN_SECRET=
ZAP_BASIC_USER=
ZAP_BASIC_PASSWORD=
```

Public gallery, docs, quickstart, studio, recipe pages, and plan-only runs are open.
Live provider spend requires a wallet-authenticated Supabase bearer token.
Provider webhook callbacks are public so hosted providers can report completion;
poll drain and Eve operational endpoints still support HTTP Basic auth for
private operations.

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
```

Live provider smoke tests are opt-in only. CLI and web runs default to plan-only mode
unless explicit credentials and a live run are requested.
