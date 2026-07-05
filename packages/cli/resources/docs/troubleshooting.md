# Troubleshooting

## Node Fails With `simdjson`

Use a working Node 24 runtime. This repo expects Node `24.x`.

```bash
node --version
npx @wzrdtech/zap@0.2.0 doctor --json
```

## `zap validate` Finds No Recipes

Run from a Zap project root containing:

```text
agent/skills/zap-*/Zap.md
```

Or pass a recipe directly:

```bash
npx @wzrdtech/zap@0.2.0 validate agent/skills/zap-world-cup-entrance/Zap.md
```

## Live Run Refuses To Start

Check three things:

- Did you pass `--live`?
- Does the quote exceed `budget.cap_usd`?
- Are provider keys available in Supabase or env?

## Supabase Secrets Return Empty

`/api/secrets` returns `configured: true` before a user is authenticated. Listing, saving, deleting, or revealing keys requires a Supabase bearer token.

## HyperFrames Is Missing

`stitch.engine: hyperframes` is optional. If `npx hyperframes --version` fails, Zap falls back to the local stitch path and records the fallback error on the step.
