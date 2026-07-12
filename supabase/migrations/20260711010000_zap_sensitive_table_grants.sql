-- Zap v0.3.0 sensitive-table grant hardening.
-- Zap reads and writes these tables only through service-role Edge Functions.

drop policy if exists "Users can view their own secrets" on public.user_secrets;
drop policy if exists "Users can insert their own secrets" on public.user_secrets;
drop policy if exists "Users can update their own secrets" on public.user_secrets;
drop policy if exists "Users can delete their own secrets" on public.user_secrets;

revoke all on table public.user_secrets from anon, authenticated;
revoke all on table public.secret_access_log from anon, authenticated;
revoke all on table public.wallet_auth_users from anon, authenticated;
revoke all on table public.wallet_auth_nonces from anon, authenticated;

revoke all on sequence public.secret_access_log_id_seq from anon, authenticated;
