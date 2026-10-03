-- AI readings: daily cap, private usage log, server-only result recording.
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';

select ok(public.begin_ai_extraction(2) is not null, 'a reading can start');
select ok(public.begin_ai_extraction(2) is not null, 'a second one too');
select throws_ok('select public.begin_ai_extraction(2)', 'P0001', 'daily_limit_reached',
  'the daily cap is enforced');
select throws_ok(
  $$select public.finish_ai_extraction(gen_random_uuid(), 'ok', 'x', 1, 1, 1)$$,
  '42501', null, 'only the server records the result'
);
select throws_ok(
  $$insert into public.ai_extractions (user_id) values ('00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'the app cannot write the usage log'
);

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is((select count(*)::int from public.ai_extractions), 0, 'Bob does not see Alice''s readings');
select ok(public.begin_ai_extraction(2) is not null, 'the cap is per user');

select * from finish();
rollback;
