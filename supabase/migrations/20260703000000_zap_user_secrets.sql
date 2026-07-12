-- Zap BYOK provider secret storage for the wzrdstudio Supabase project.
-- Apply after reviewing the existing user_secrets edge function/table mismatch.

create table if not exists public.user_secrets (
  user_id uuid not null references auth.users(id) on delete cascade
);

alter table if exists public.user_secrets
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists secret_type text,
  add column if not exists ciphertext text,
  add column if not exists last4 text,
  add column if not exists nonce text,
  add column if not exists provider text,
  add column if not exists key_version integer not null default 1,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- The shared wzrdstudio project predates Zap's AES-GCM envelope and has an
-- unused, required `encrypted_value` column. Keep the legacy column for other
-- consumers, but allow Zap rows to use `ciphertext` + `nonce` instead.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_secrets'
      and column_name = 'encrypted_value'
  ) then
    alter table public.user_secrets alter column encrypted_value drop not null;
  end if;
end;
$$;

create unique index if not exists user_secrets_user_id_secret_type_idx
  on public.user_secrets (user_id, secret_type);

create index if not exists user_secrets_user_id_idx
  on public.user_secrets (user_id);

create table if not exists public.wallet_auth_users (
  address text primary key check (address ~ '^0x[a-f0-9]{40}$'),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallet_auth_users enable row level security;
alter table public.wallet_auth_users force row level security;

drop policy if exists "wallet auth users select own" on public.wallet_auth_users;
create policy "wallet auth users select own"
  on public.wallet_auth_users for select
  using ((select auth.uid()) = user_id);

create table if not exists public.wallet_auth_nonces (
  nonce text primary key,
  address text not null references public.wallet_auth_users(address) on delete cascade,
  used_at timestamptz not null default now()
);

alter table public.wallet_auth_nonces enable row level security;
alter table public.wallet_auth_nonces force row level security;

alter table public.user_secrets enable row level security;
alter table public.user_secrets force row level security;

drop policy if exists "zap user secrets select own" on public.user_secrets;
drop policy if exists "zap user secrets insert own" on public.user_secrets;
drop policy if exists "zap user secrets update own" on public.user_secrets;
drop policy if exists "zap user secrets delete own" on public.user_secrets;

create policy "zap user secrets select own"
  on public.user_secrets for select
  using ((select auth.uid()) = user_id);

create policy "zap user secrets insert own"
  on public.user_secrets for insert
  with check ((select auth.uid()) = user_id);

create policy "zap user secrets update own"
  on public.user_secrets for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "zap user secrets delete own"
  on public.user_secrets for delete
  using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_secrets_set_updated_at on public.user_secrets;
create trigger user_secrets_set_updated_at
before update on public.user_secrets
for each row execute function public.set_updated_at();
