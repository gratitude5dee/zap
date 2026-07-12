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
- `ZAP_MANAGED_PROVIDER_SECRETS_FUNCTION` (defaults to `zap-managed-provider-secrets`)
- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `BLOB_READ_WRITE_TOKEN`
- `ZAP_SANDBOX_BACKEND=box` (Box is the default even when omitted)
- `BOX_API_KEY`, unless the key is stored in the Supabase managed-secret bridge

Supabase Edge Function secrets:

- `USER_SECRETS_ENCRYPTION_KEY`
- `ZAP_SECRET_REVEAL_TOKEN`
- `ZAP_WALLET_AUTH_SECRET`
- `ZAP_WALLET_TOKEN_TTL_SECONDS`
- Managed provider credentials used by `zap-managed-provider-secrets`, such as `FAL_KEY`, may remain in Supabase instead of being copied into Vercel.
- `BOX_API_KEY` may also remain in Supabase; the Box adapter resolves its allow-listed `box_api_key` server-side before loading `@asciidev/eve-box`.

`ZAP_SECRET_REVEAL_TOKEN` must contain the same high-entropy value in Vercel and Supabase. The managed-provider function disables Supabase JWT verification because it performs constant-time custom server authentication; it has no browser CORS policy and returns only allow-listed provider fields.

The ascii.dev account must have an active trial or paid Box plan before production can create a sandbox. Zap creates public/multi-tenant Boxes with `noEnv: true`, so account-level Box secrets and repositories are not inherited.

NPM release auth:

- Preferred: configure npm trusted publishing for `@wzrdtech/core`, `@wzrdtech/providers`, and `@wzrdtech/zap` with GitHub owner `gratitude5dee`, repository `Zap`, workflow filename `release.yml`, and allowed action `npm publish`.
- Fallback: add a GitHub Actions secret named `NPM_TOKEN` with package creation and publish access to the `@wzrdtech` scope.
- For npm accounts with 2FA enabled, `NPM_TOKEN` must be a granular token with read/write package access and **Bypass 2FA** enabled; normal login/session tokens authenticate but fail publish with `EOTP`.
- First publication of new workspace packages, such as `@wzrdtech/core` and `@wzrdtech/providers`, requires either package-level trusted publisher authorization for those package names or an `NPM_TOKEN` that can create packages in the scope and bypass the publish 2FA challenge.
- The Release workflow uses `NPM_TOKEN` when present; otherwise it leaves `NODE_AUTH_TOKEN` unset so npm can authenticate through OIDC trusted publishing.
- The Release workflow skips package versions that are already present on npm, so it is safe to rerun after a partial publish.

Deploy sequence:

```bash
npm test
npm run typecheck
npm run build
gh workflow run Release --repo gratitude5dee/Zap --ref main -f publish=true
vercel deploy --prod --yes
```

Apply Supabase migrations before enabling live BYOK runs.
