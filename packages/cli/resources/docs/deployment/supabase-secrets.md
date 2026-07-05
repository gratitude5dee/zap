# Supabase Secrets

Zap uses Supabase `wzrdstudio` for creator auth and bring-your-own-key provider secrets.

The web app accepts either a current Supabase publishable key or a legacy anon key:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
# or, for legacy projects:
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

## Required Fix

The current `user_secrets` table and existing `manage-user-secrets` edge function are not aligned. Before live BYOK runs depend on Supabase, migrate to a single encrypted shape:

```sql
alter table public.user_secrets
  add column if not exists ciphertext text,
  add column if not exists nonce text,
  add column if not exists key_version integer not null default 1;
```

Then force RLS and expose only JWT-protected edge functions that return masked metadata to the browser. Server-side runtime paths may retrieve plaintext only for the authenticated owner of the run.

## Edge Function

Deploy `supabase/functions/zap-user-secrets` with JWT verification enabled. Required Supabase secrets:

```bash
USER_SECRETS_ENCRYPTION_KEY=<long random value>
ZAP_SECRET_REVEAL_TOKEN=<long random value shared with Vercel>
```

Browser calls may list, save, or delete masked secrets. Plaintext reveal requires both the authenticated user's JWT and `x-zap-server-secret`, so only the Zap server can retrieve keys for a live run.

Deploy `supabase/functions/zap-wallet-proof` for wallet login. Required Supabase secrets:

```bash
ZAP_WALLET_AUTH_SECRET=<long random value>
ZAP_WALLET_TOKEN_TTL_SECONDS=604800
```

`SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are supplied by the Supabase Edge Function runtime. Legacy `SUPABASE_SERVICE_ROLE_KEY` is also supported. The wallet proof function verifies a wallet signature and one-time nonce, then lets Supabase Auth mint the authenticated session token.

## Secret Types

- `gmi_api_key`
- `gmi_org_id`
- `fal_key`
- `runware_key`
- `prodia_token`
- `openrouter_key`
- `ai_gateway_api_key`

Do not use legacy `profiles.*_api_key` columns for Zap provider execution.

## App Routes

- `/settings` lets creators connect a Supabase/Thirdweb wallet token and manage BYOK provider keys.
- `/api/auth/wallet-proof` proxies Thirdweb wallet proof payloads to the Supabase `zap-wallet-proof` function by default. Override with `ZAP_WALLET_PROOF_FUNCTION` only when intentionally targeting another function.
- `supabase/functions/zap-wallet-proof` verifies an EIP-191 wallet signature payload, records nonce use in `wallet_auth_nonces`, creates or reuses a Supabase Auth user mapped in `wallet_auth_users`, and returns a Supabase Auth session token for Zap APIs.
- `/api/secrets` lists, upserts, and deletes masked user secrets through `zap-user-secrets`.
