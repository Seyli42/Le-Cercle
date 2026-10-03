-- Premium granted by the administrator (B2B): readable by the person only, never writable
-- from the app.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');
insert into public.premium_grants (user_id, starts_at, ends_at, reason) values
  ('00000000-0000-0000-0000-00000000000a', now() - interval '30 days', now() + interval '1 year', 'Pharmacie du Centre'),
  ('00000000-0000-0000-0000-00000000000a', now() - interval '2 years', now() - interval '1 year', 'Ancien contrat'),
  ('00000000-0000-0000-0000-00000000000b', now() - interval '2 years', now() - interval '1 day', 'Expiré');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', true);

select is((select count(*)::int from public.premium_grants), 2, 'Alice sees her own grants only');
select is((select reason from public.my_premium_grant()), 'Pharmacie du Centre', 'the grant in force is returned');
select throws_ok(
  $$ insert into public.premium_grants (user_id, reason) values ('00000000-0000-0000-0000-00000000000a', 'moi') $$,
  '42501', null, 'cannot grant oneself Premium');
select throws_ok(
  $$ update public.premium_grants set ends_at = null $$,
  '42501', null, 'cannot extend a grant');
select throws_ok(
  $$ delete from public.premium_grants $$,
  '42501', null, 'cannot delete a grant');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', true);
select is((select count(*)::int from public.my_premium_grant()), 0, 'an expired grant gives nothing');
select is((select count(*)::int from public.premium_grants where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'Bob cannot see Alice''s grants');

reset role;
set local role anon;
select throws_ok($$ select * from public.my_premium_grant() $$, '42501', null, 'signed-out callers get nothing');

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
select is((select count(*)::int from public.premium_grants where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'deleted with the account');

select * from finish();
rollback;
