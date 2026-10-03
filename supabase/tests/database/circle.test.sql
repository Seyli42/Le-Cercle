-- The circle by notification: invitation code (= consent of the relative), the phones
-- to alert, missed-intake detection, and every safeguard around them.
begin;
select plan(37);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com');
update public.profiles set first_name = 'Marie', missed_dose_delay_minutes = 30
  where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set first_name = 'Robert' where id = '00000000-0000-0000-0000-00000000000b';
update public.profiles set first_name = 'Claire' where id = '00000000-0000-0000-0000-00000000000c';

-- Alice: one medication, every day at 08:00 (Paris), created well before.
insert into public.medications (id, user_id, name, dose_label, starts_on) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'Kardégic', '1 sachet', '2026-09-01');
insert into public.schedules (id, user_id, medication_id, time_of_day, created_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '10000000-0000-0000-0000-000000000001', '08:00', '2026-09-01');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id)::text, true)
$$;
create temporary table codes (name text primary key, code text);
grant all on codes to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select * from public.claim_missed_doses()$$, '42501', null,
  'a user cannot trigger alerts');
select throws_ok($$select public.forget_push_tokens(array['x'])$$, '42501', null,
  'a user cannot delete phones');
select throws_ok($$select * from public.circle_invites$$, '42501', null,
  'invitation codes are not readable from the app');
select throws_ok(
  $$insert into public.circle_links (patient_id, watcher_id) values
    ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'nobody can join a circle without a code');

-- Heartbeat: time zone kept in step with the phone, invalid ones ignored.
select public.sync_heartbeat('Europe/Paris');
select public.sync_heartbeat('Mars/Olympus');
reset role;
select is((select timezone from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Europe/Paris', 'an invalid time zone is ignored');
select ok((select last_seen_at is not null from public.profiles
  where id = '00000000-0000-0000-0000-00000000000a'), 'the last contact of the phone is recorded');

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select throws_ok($$select * from public.create_circle_invite()$$, 'P0001', 'first_name_required',
  'the relatives must see a first name');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into codes select 'old', code from public.create_circle_invite();
insert into codes select 'new', code from public.create_circle_invite();
select matches((select code from codes where name = 'new'), '^[A-HJ-NP-Z2-9]{8}$',
  '8 characters, none of them ambiguous (0/O, 1/I)');
select is((select code from public.my_circle_invite()), (select code from codes where name = 'new'),
  'the valid code can be shown again');
select throws_ok(
  format('select * from public.accept_circle_invite(%L)', (select code from codes where name = 'new')),
  'P0001', 'own_invite', 'nobody watches over themselves');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format('select * from public.accept_circle_invite(%L)', (select code from codes where name = 'old')),
  'P0001', 'invalid_code', 'a new code cancels the previous one');
-- Typed in lower case with a dash, as people do.
select is(
  (select patient_first_name from public.accept_circle_invite(
     lower(substr((select code from codes where name = 'new'), 1, 4) || '-' ||
           substr((select code from codes where name = 'new'), 5)))),
  'Marie', 'the relative joins and sees the first name');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select throws_ok(
  format('select * from public.accept_circle_invite(%L)', (select code from codes where name = 'new')),
  'P0001', 'invalid_code', 'a code works only once');
select is((select count(*)::int from public.circle_links), 0, 'outsiders see no link');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select results_eq($$select role, first_name from public.my_circle()$$,
  $$values ('watcher', 'Robert')$$, 'the person sees who watches over them');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select results_eq($$select role, first_name from public.my_circle()$$,
  $$values ('patient', 'Marie')$$, 'the relative sees whom they watch over');

-- Guessing codes: blocked after 10 wrong tries in an hour.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
reset role;
insert into public.circle_invite_attempts (user_id)
select '00000000-0000-0000-0000-00000000000c' from generate_series(1, 10);
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select throws_ok($$select * from public.accept_circle_invite('ABCDEFGH')$$, 'P0001',
  'too_many_attempts', 'guessing codes is blocked');

-- At most 5 relatives.
reset role;
insert into auth.users (id, email)
select ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'w' || n || '@example.com'
from generate_series(1, 4) n;
insert into public.circle_links (patient_id, watcher_id)
select '00000000-0000-0000-0000-00000000000a',
       ('00000000-0000-0000-0000-0000000001' || lpad(n::text, 2, '0'))::uuid
from generate_series(1, 4) n;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$select * from public.create_circle_invite()$$, 'P0001', 'circle_full',
  'a circle has at most 5 relatives');
reset role;
delete from public.circle_links where watcher_id::text like '00000000-0000-0000-0000-0000000001%';

-- ---------------------------------------------------------------------------
-- Phones of the relatives
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.register_push_token('ExponentPushToken[bob-phone-123456]', 'ios');
select throws_ok($$select public.register_push_token('not-a-token', 'ios')$$, '23514', null,
  'only Expo push tokens are accepted');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.register_push_token('ExponentPushToken[shared-tablet-12]', 'android');
-- The family tablet: Bob signs in on it, the token now belongs to him.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.register_push_token('ExponentPushToken[shared-tablet-12]', 'android');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.unregister_push_token('ExponentPushToken[shared-tablet-12]');
reset role;
select is((select user_id::text from public.push_tokens where token = 'ExponentPushToken[shared-tablet-12]'),
  '00000000-0000-0000-0000-00000000000b',
  'a token follows the last account signed in, and nobody else can remove it');

-- ---------------------------------------------------------------------------
-- Missed intakes (Alice, watched by Bob on 2 phones)
-- ---------------------------------------------------------------------------
set local role service_role;
select is((select count(*)::int from public.claim_missed_doses('2026-10-03 06:20:00+00')), 0,
  'no alert before the delay (08:00 + 30 min)');
select results_eq(
  $$select patient_first_name, planned_local_time, cardinality(tokens)
    from public.claim_missed_doses('2026-10-03 06:45:00+00')$$,
  $$values ('Marie', '08:00', 2)$$,
  'after the delay, the relative''s phones are alerted, without the medication name');
select is((select count(*)::int from public.claim_missed_doses('2026-10-03 06:50:00+00')), 0,
  'never twice for the same intake');
reset role;
select is((select status from public.dose_events where scheduled_at = '2026-10-03 06:00:00+00'),
  'missed', 'the intake is marked missed');
set local role service_role;
select lives_ok($$select public.record_alert_result(id, true) from public.circle_alerts$$,
  'the sending result is recorded');
reset role;
select is((select count(*)::int from public.circle_alerts where status = 'sent'), 1, 'marked sent');

-- Both sides see the alert, nobody else.
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.circle_alerts), 1, 'the relative sees the alert');
select ok((select last_alert_at is not null from public.my_circle()), 'with its time');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.circle_alerts), 0, 'outsiders see nothing');

-- The phone was offline: "taken" at 08:10 arrives at 10:00. It must win over "missed".
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.sync_push(p_dose_events => '[{"id":"30000000-0000-0000-0000-000000000001",
  "medication_id":"10000000-0000-0000-0000-000000000001",
  "schedule_id":"20000000-0000-0000-0000-000000000001",
  "scheduled_at":"2026-10-03T06:00:00Z","status":"taken",
  "responded_at":"2026-10-03T06:10:00Z","client_updated_at":"2026-10-03T06:10:00Z"}]'::jsonb);
reset role;
select is((select status from public.dose_events where scheduled_at = '2026-10-03 06:00:00+00'),
  'taken', 'an answer given offline replaces the server''s "missed"');

-- Daily cap.
set local role service_role;
select is((select count(*)::int from public.claim_missed_doses('2026-10-04 06:40:00+00', p_daily_cap => 1)),
  0, 'the daily cap limits the alerts');
select is((select count(*)::int from public.claim_missed_doses('2026-10-04 06:41:00+00')), 1,
  'within the cap, the alert goes');

-- The relative leaves: the pending alert is cancelled, nothing more is sent.
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.revoke_circle_link((select link_id from public.my_circle()));
reset role;
select is(
  (select a.status from public.circle_alerts a join public.dose_events e on e.id = a.dose_event_id
   where e.scheduled_at = '2026-10-04 06:00:00+00'),
  'cancelled', 'leaving cancels the pending alert');
set local role service_role;
select is((select count(*)::int from public.claim_missed_doses('2026-10-05 06:45:00+00')), 0,
  'a relative who left receives nothing more');

-- Bob comes back (new code). Clock change: 25 October 2026, 08:00 in Paris = 07:00 UTC.
reset role;
set local role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into codes select 'again', code from public.create_circle_invite();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select * from public.accept_circle_invite((select code from codes where name = 'again'));
reset role;
set local role service_role;
select results_eq(
  $$select planned_local_time from public.claim_missed_doses('2026-10-25 07:45:00+00')$$,
  $$values ('08:00')$$, 'intakes follow the local time across the clock change');

-- A schedule created after the planned time: nothing was expected.
reset role;
update public.schedules set created_at = '2026-10-26 07:30:00+00'
  where id = '20000000-0000-0000-0000-000000000001';
set local role service_role;
select is((select count(*)::int from public.claim_missed_doses('2026-10-26 07:45:00+00')), 0,
  'no alert for an intake planned before the schedule existed');

-- Deleting the relative's account removes the link and their phones.
reset role;
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select is((select count(*)::int from public.circle_links where revoked_at is null
  and patient_id = '00000000-0000-0000-0000-00000000000a'), 0,
  'a deleted relative leaves the circle');

select * from finish();
rollback;
