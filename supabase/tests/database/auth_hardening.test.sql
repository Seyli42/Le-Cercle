-- Sessions obtained with a password are refused (account pre-creation attack), except
-- for the demo account of the store reviewers. E-mail codes keep working.
begin;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'Demo@Lecercle.example');
insert into private.password_sign_in_allowlist (email, reason)
  values ('demo@lecercle.example', 'App Store / Google Play review');

create function pg_temp.event(user_id text, method text) returns jsonb language sql as $$
  select jsonb_build_object(
    'user_id', user_id,
    'authentication_method', method,
    'claims', jsonb_build_object('sub', user_id, 'role', 'authenticated', 'aud', 'authenticated')
  )
$$;

select is(
  public.custom_access_token_hook(pg_temp.event('00000000-0000-0000-0000-00000000000a', 'password')) -> 'error' ->> 'http_code',
  '403', 'password session refused for a regular account');
select ok(
  public.custom_access_token_hook(pg_temp.event('00000000-0000-0000-0000-00000000000a', 'password')) -> 'claims' is null,
  'no token claims are returned when refused');
select is(
  public.custom_access_token_hook(pg_temp.event('00000000-0000-0000-0000-00000000000a', 'otp')) -> 'claims' ->> 'sub',
  '00000000-0000-0000-0000-00000000000a', 'e-mail code sign-in is unchanged');
select is(
  public.custom_access_token_hook(pg_temp.event('00000000-0000-0000-0000-00000000000a', 'magiclink')) -> 'error',
  null, 'magic link / code verification allowed');
select is(
  public.custom_access_token_hook(pg_temp.event('00000000-0000-0000-0000-00000000000a', 'token_refresh')) -> 'error',
  null, 'session refresh allowed');
select is(
  public.custom_access_token_hook(pg_temp.event('00000000-0000-0000-0000-00000000000d', 'password')) -> 'claims' ->> 'sub',
  '00000000-0000-0000-0000-00000000000d', 'demo account may use its password (case-insensitive e-mail)');
select is(
  public.custom_access_token_hook(pg_temp.event('00000000-0000-0000-0000-0000000000ff', 'password')) -> 'error' ->> 'http_code',
  '403', 'unknown user refused');

select ok(
  not has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'app users cannot call the hook');
select ok(
  has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'execute'),
  'Supabase Auth can call the hook');
select ok(
  not has_table_privilege('authenticated', 'private.password_sign_in_allowlist', 'select'),
  'app users cannot read or edit the allowlist');

select * from finish();
rollback;
