-- Sign-in hardening before publication.
--
-- Le Cercle signs people in with a 6-digit e-mail code only. Supabase nevertheless
-- accepts e-mail + password sign-ups by default, which allows an account
-- "pre-creation" attack: someone signs up with a stranger's address and a password,
-- the stranger later starts using the app with e-mail codes (same account), and the
-- attacker reads their health data with the password.
--
-- This hook runs every time Supabase issues a session and refuses those obtained with a
-- password, except for the addresses listed below (the demo account given to the Apple
-- and Google reviewers). Enable it in the dashboard: Authentication → Hooks →
-- Customize Access Token → Postgres → public.custom_access_token_hook.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.password_sign_in_allowlist (
  email text primary key check (email = lower(email)),
  reason text not null,
  created_at timestamptz not null default now()
);
revoke all on private.password_sign_in_allowlist from public, anon, authenticated;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if event ->> 'authentication_method' = 'password'
     and not exists (
       select 1
       from auth.users u
       join private.password_sign_in_allowlist a on a.email = lower(u.email)
       where u.id = (event ->> 'user_id')::uuid
     ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'La connexion par mot de passe n''est pas disponible : utilisez le code reçu par e-mail.'
      )
    );
  end if;
  -- Every other way in (e-mail code, refresh) is unchanged.
  return jsonb_build_object('claims', event -> 'claims');
end;
$$;

-- Only Supabase Auth may call it.
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
