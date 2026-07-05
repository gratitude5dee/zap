# Deploy

Production target:

```text
Vercel project: zap
Domain: zap.wzrd.tech
Node: 24.x
Supabase project: wzrdstudio / ixkkrousepsiorwlaycp
```

Vercel app env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ZAP_SECRET_REVEAL_TOKEN`
- `ZAP_WALLET_PROOF_FUNCTION`
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `BLOB_READ_WRITE_TOKEN`

Supabase Edge Function secrets:

- `USER_SECRETS_ENCRYPTION_KEY`
- `ZAP_SECRET_REVEAL_TOKEN`
- `ZAP_WALLET_AUTH_SECRET`
- `ZAP_WALLET_TOKEN_TTL_SECONDS`

NPM release auth:

- Preferred: configure npm trusted publishing for `@wzrdtech/core`, `@wzrdtech/providers`, and `@wzrdtech/zap` with GitHub owner `gratitude5dee`, repository `Zap`, workflow filename `release.yml`, and allowed action `npm publish`.
- Fallback: add a GitHub Actions secret named `NPM_TOKEN` with package creation and publish access to the `@wzrdtech` scope.
- First publication of new workspace packages, such as `@wzrdtech/core` and `@wzrdtech/providers`, requires either package-level trusted publisher authorization for those package names or an `NPM_TOKEN` that can create packages in the scope.
- The Release workflow uses `NPM_TOKEN` when present; otherwise it leaves `NODE_AUTH_TOKEN` unset so npm can authenticate through OIDC trusted publishing.

Deploy sequence:

```bash
npm test
npm run typecheck
npm run build
gh workflow run Release --repo gratitude5dee/Zap --ref main -f publish=true
vercel deploy --prod --yes
```

Apply Supabase migrations before enabling live BYOK runs.
