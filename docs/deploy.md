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

Deploy sequence:

```bash
npm test
npm run typecheck
npm run build
vercel deploy --prod --yes
```

Apply Supabase migrations before enabling live BYOK runs.
