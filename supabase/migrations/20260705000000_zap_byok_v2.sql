-- Zap v0.2.0 BYOK hardening.
-- Forward-only: standardize Prodia on prodia_token and record server-side secret reveals.

alter table public.user_secrets
  add column if not exists provider text;

update public.user_secrets
set secret_type = 'prodia_token',
    provider = 'prodia'
where secret_type = 'prodia_key';

alter table public.user_secrets
  drop constraint if exists user_secrets_secret_type_check,
  add constraint user_secrets_secret_type_check
    check (
      secret_type in (
        'gmi_api_key',
        'gmi_org_id',
        'fal_key',
        'prodia_token',
        'runware_key',
        'openrouter_key',
        'ai_gateway_api_key'
      )
    );

alter table public.user_secrets
  drop constraint if exists user_secrets_provider_check,
  add constraint user_secrets_provider_check
    check (provider in ('gmi', 'fal', 'prodia', 'runware', 'openrouter', 'ai_gateway'));

create table if not exists public.secret_access_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  secret_type text not null,
  reason text not null,
  accessed_at timestamptz not null default now()
);

create index if not exists secret_access_log_user_id_accessed_at_idx
  on public.secret_access_log (user_id, accessed_at desc);

create index if not exists secret_access_log_secret_type_idx
  on public.secret_access_log (secret_type);

alter table public.secret_access_log enable row level security;
alter table public.secret_access_log force row level security;

drop policy if exists "secret access log select own" on public.secret_access_log;
create policy "secret access log select own"
  on public.secret_access_log for select
  using ((select auth.uid()) = user_id);
