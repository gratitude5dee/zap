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

## Secret Types

- `gmi_api_key`
- `gmi_org_id`
- `fal_key`
- `runware_key`
- `prodia_key`
- `openrouter_key`
- `ai_gateway_api_key`

Do not use legacy `profiles.*_api_key` columns for Zap provider execution.
