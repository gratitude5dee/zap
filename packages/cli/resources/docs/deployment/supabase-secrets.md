# Supabase Secrets

Zap uses Supabase `wzrdstudio` for creator auth and bring-your-own-key provider secrets.

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

## Secret Types

- `gmi_api_key`
- `gmi_org_id`
- `fal_key`
- `runware_key`
- `prodia_key`
- `openrouter_key`
- `ai_gateway_api_key`

Do not use legacy `profiles.*_api_key` columns for Zap provider execution.

## App Routes

- `/settings` lets creators connect a Supabase/Thirdweb wallet token and manage BYOK provider keys.
- `/api/auth/wallet-proof` proxies Thirdweb wallet proof payloads to the Supabase `wallet-proof` function.
- `/api/secrets` lists, upserts, and deletes masked user secrets through `zap-user-secrets`.
