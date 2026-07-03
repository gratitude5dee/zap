# Zap

Zap is a content-agent framework on Eve for 1-click generative video recipes. A
Zap is a packaged Eve skill (`agent/skills/zap-<slug>/SKILL.md`) whose
frontmatter describes an executable media pipeline and whose prose/prompt files
give humans and the authoring agent creative context.

## What Ships

- Next.js app mounted with `withEve`.
- Creator view at `/zap/world-cup-entrance`.
- Dev/agent view at `/studio`.
- Run detail view at `/runs/:runId`.
- Eve tools for running, extending, stitching, judging, and saving Zaps.
- Convex schema/functions for `zaps`, `runs`, `steps`, `assets`, `feedback`, and
  `cronLogs`.
- Upstash Redis idempotency and provider queue helpers.
- GMI Cloud video adapter and fal adapter behind one provider router.

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
ZAP_BASIC_USER=
ZAP_BASIC_PASSWORD=
```

V1 is private-gated. Browser access to `/zap`, `/studio`, `/runs`,
`/api/providers`, and `/eve` requires HTTP Basic auth unless the request is local
development or Vercel OIDC.

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
npm run typecheck
npm test
npm run eve:info
npm run eve:build
```

Live provider smoke tests are opt-in only. The adapters are implemented, but no
test submits paid GMI/fal work unless explicit credentials and a live run are
requested.
