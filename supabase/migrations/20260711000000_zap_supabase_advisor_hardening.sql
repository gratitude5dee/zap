-- Zap v0.3.0 Supabase advisor hardening.
-- Forward-only: pin the trigger search path and avoid a duplicate unique index
-- when the shared project already enforces the same key with a constraint.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.user_secrets_user_id_secret_type_idx') is not null
    and exists (
      select 1
      from pg_constraint
      where conrelid = 'public.user_secrets'::regclass
        and contype = 'u'
        and pg_get_constraintdef(oid) = 'UNIQUE (user_id, secret_type)'
    ) then
    drop index public.user_secrets_user_id_secret_type_idx;
  end if;
end;
$$;
