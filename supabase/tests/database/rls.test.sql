-- Security tests: every user is isolated from every other user.
-- Run with `npx supabase test db` (Docker) or `npm run test:db` (plain Postgres).
begin;
select plan(25);

-- Two accounts: Alice and Bob.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.profiles'::regclass, 'public.medications'::regclass,
                 'public.schedules'::regclass, 'public.dose_events'::regclass,
                 'public.circle_links'::regclass, 'public.circle_alerts'::regclass,
                 'public.circle_invites'::regclass, 'public.push_tokens'::regclass)),
  'RLS is enabled on every table'
);
select is(
  (select count(*)::int from public.profiles),
  2,
  'a profile is created automatically for each new account'
);

-- ---------------------------------------------------------------------------
-- Alice creates her data
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';

select lives_ok(
  $$insert into public.medications (id, name, dose_label)
    values ('10000000-0000-0000-0000-000000000001', 'Doliprane', '1 comprimé')$$,
  'Alice can add a medication (user_id is filled automatically)'
);
select lives_ok(
  $$insert into public.schedules (id, medication_id, time_of_day)
    values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '08:00')$$,
  'Alice can add a schedule to her medication'
);
select lives_ok(
  $$insert into public.dose_events (id, medication_id, schedule_id, scheduled_at)
    values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000001', '2026-10-02 08:00+02')$$,
  'Alice can record a dose event'
);
select throws_ok(
  $$insert into public.dose_events (medication_id, schedule_id, scheduled_at)
    values ('10000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000001', '2026-10-02 08:00+02')$$,
  '23505', null,
  'the same occurrence cannot be recorded twice (idempotent sync)'
);
select lives_ok(
  $$update public.profiles set first_name = 'Alice', health_data_consent_at = now()
    where id = '00000000-0000-0000-0000-00000000000a'$$,
  'Alice can update her profile settings'
);
select throws_ok(
  $$update public.profiles set created_at = now() - interval '1 year'$$,
  '42501', null,
  'Alice cannot rewrite protected profile columns'
);

-- ---------------------------------------------------------------------------
-- Data validation
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.medications (name, dose_label, starts_on, ends_on)
    values ('X', '1', '2026-10-10', '2026-10-01')$$,
  '23514', null,
  'a treatment cannot end before it starts'
);
select throws_ok(
  $$insert into public.medications (name, dose_label) values ('   ', '1')$$,
  '23514', null,
  'a blank medication name is rejected'
);
select throws_ok(
  $$insert into public.schedules (medication_id, time_of_day, days_of_week)
    values ('10000000-0000-0000-0000-000000000001', '09:00', '{8}')$$,
  '23514', null,
  'an invalid weekday is rejected'
);
select throws_ok(
  $$insert into public.circle_alerts (patient_id, watcher_id, dose_event_id)
    values ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
            '30000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  'only the server can write alerts'
);

-- ---------------------------------------------------------------------------
-- Bob must see and touch nothing of Alice's
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';

select is((select count(*)::int from public.medications), 0, 'Bob sees no medication of Alice');
select is((select count(*)::int from public.schedules), 0, 'Bob sees no schedule of Alice');
select is((select count(*)::int from public.dose_events), 0, 'Bob sees no dose event of Alice');
select is((select count(*)::int from public.circle_links), 0, 'Bob sees no circle of Alice');
select is((select count(*)::int from public.profiles), 1, 'Bob only sees his own profile');

update public.medications set name = 'piraté' where id = '10000000-0000-0000-0000-000000000001';
delete from public.medications where id = '10000000-0000-0000-0000-000000000001';

select throws_ok(
  $$insert into public.medications (user_id, name, dose_label)
    values ('00000000-0000-0000-0000-00000000000a', 'Faux', '1')$$,
  '42501', null,
  'Bob cannot create a medication in Alice''s account'
);
select throws_ok(
  $$insert into public.schedules (medication_id, time_of_day)
    values ('10000000-0000-0000-0000-000000000001', '10:00')$$,
  '23503', null,
  'Bob cannot attach a schedule to Alice''s medication'
);
select throws_ok(
  $$insert into public.dose_events (medication_id, schedule_id, scheduled_at)
    values ('10000000-0000-0000-0000-000000000001',
            '20000000-0000-0000-0000-000000000001', now())$$,
  '23503', null,
  'Bob cannot record a dose on Alice''s schedule'
);

-- ---------------------------------------------------------------------------
-- Signed-out requests get nothing
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{}';
select throws_ok('select * from public.medications', '42501', null, 'anon cannot read medications');
select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.circle_links', '42501', null, 'anon cannot read circles');

-- ---------------------------------------------------------------------------
-- Alice's data survived Bob's attempts
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select name from public.medications where id = '10000000-0000-0000-0000-000000000001'),
  'Doliprane',
  'Bob''s update had no effect'
);
select is(
  (select count(*)::int from public.medications),
  1,
  'Bob''s delete had no effect'
);

select * from finish();
rollback;
