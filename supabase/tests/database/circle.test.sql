-- The circle: consent by SMS, missed-intake alerts, and every safeguard around them.
begin;
select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');
update public.profiles set first_name = 'Marie', missed_dose_delay_minutes = 30
  where id = '00000000-0000-0000-0000-00000000000a';

-- Alice: one medication, every day at 08:00 (Paris), created well before.
insert into public.medications (id, user_id, name, dose_label, starts_on) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   'Kardégic', '1 sachet', '2026-09-01');
insert into public.schedules (id, user_id, medication_id, time_of_day, created_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '10000000-0000-0000-0000-000000000001', '08:00', '2026-09-01');
-- Léa has accepted, Paul has not answered yet.
insert into public.circle_members (id, user_id, first_name, phone_e164) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Léa', '+33611111111'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Paul', '+33622222222');
update public.circle_members set consent_status = 'confirmed'
  where id = '40000000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select throws_ok(
  $$select * from public.claim_missed_doses()$$, '42501', null,
  'a user cannot trigger alerts'
);
select throws_ok(
  $$select public.confirm_circle_invite('+33622222222', null)$$, '42501', null,
  'a user cannot confirm a relative''s consent'
);
select throws_ok(
  $$select invite_code from public.circle_members$$, '42501', null,
  'invitation codes are not readable from the app'
);
select lives_ok(
  $$select id, first_name, consent_status, invite_sent_at from public.circle_members$$,
  'the rest of the circle is readable'
);

-- Heartbeat: time zone kept in step with the phone, invalid ones ignored.
select public.sync_heartbeat('Europe/Paris');
select public.sync_heartbeat('Mars/Olympus');
reset role;
select is(
  (select timezone from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'Europe/Paris', 'an invalid time zone is ignored'
);
select ok(
  (select last_seen_at is not null from public.profiles where id = '00000000-0000-0000-0000-00000000000a'),
  'the last contact of the phone is recorded'
);

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select matches(
  (select invite_code from public.prepare_circle_invite('40000000-0000-0000-0000-000000000002')),
  '^[0-9]{4}$', 'an invitation gets a 4-digit code'
);
select throws_ok(
  $$select * from public.prepare_circle_invite('40000000-0000-0000-0000-000000000002')$$,
  'P0001', 'invite_too_soon', 'invitations cannot be sent in a burst'
);
select throws_ok(
  $$select * from public.prepare_circle_invite('40000000-0000-0000-0000-000000000001')$$,
  'P0001', 'already_confirmed', 'no invitation to someone who already accepted'
);
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select throws_ok(
  $$select * from public.prepare_circle_invite('40000000-0000-0000-0000-000000000002')$$,
  'P0002', 'member_not_found', 'nobody can send an invitation from another account'
);
insert into public.circle_members (id, first_name, phone_e164) values
  ('40000000-0000-0000-0000-000000000003', 'Paul', '+33622222222');
select throws_ok(
  $$select * from public.prepare_circle_invite('40000000-0000-0000-0000-000000000003')$$,
  'P0001', 'first_name_required', 'the SMS needs the first name of the person'
);

-- ---------------------------------------------------------------------------
-- Answers by SMS
-- ---------------------------------------------------------------------------
reset role;
-- Bob also invites Paul's number: a bare "OUI" is now ambiguous.
update public.profiles set first_name = 'Robert' where id = '00000000-0000-0000-0000-00000000000b';
update public.circle_members set invite_code = '9999', invite_sent_at = now()
  where id = '40000000-0000-0000-0000-000000000003';
select is(public.confirm_circle_invite('+33622222222', null), 'code_required',
  'a bare OUI never confirms the wrong circle');
select is(public.confirm_circle_invite('+33622222222', '0000'), 'wrong_code',
  'a wrong code confirms nothing');
select is(public.confirm_circle_invite('+33622222222', '9999'), 'confirmed',
  'the right code confirms only that circle');
select is(
  (select consent_status from public.circle_members where id = '40000000-0000-0000-0000-000000000002'),
  'pending', 'the other circle is untouched'
);
select is(public.confirm_circle_invite('+33622222222', null), 'confirmed',
  'with a single pending invitation, OUI alone is enough');
select is(public.confirm_circle_invite('+33699999999', null), 'no_pending_invite',
  'unknown numbers are ignored');

-- ---------------------------------------------------------------------------
-- Missed intakes (Alice: Léa and Paul now consent)
-- ---------------------------------------------------------------------------
set local role service_role;
select is(
  (select count(*)::int from public.claim_missed_doses('2026-10-03 06:20:00+00')),
  0, 'no alert before the delay (08:00 + 30 min)'
);
select results_eq(
  $$select member_first_name, patient_first_name, planned_local_time
    from public.claim_missed_doses('2026-10-03 06:45:00+00') order by member_first_name$$,
  $$values ('Léa', 'Marie', '08:00'), ('Paul', 'Marie', '08:00')$$,
  'after the delay, every consenting relative is alerted, without the medication name'
);
select is(
  (select count(*)::int from public.claim_missed_doses('2026-10-03 06:50:00+00')),
  0, 'never twice for the same intake'
);
select is(
  (select status from public.dose_events where scheduled_at = '2026-10-03 06:00:00+00'),
  'missed', 'the intake is marked missed'
);
select lives_ok(
  $$select public.record_alert_result(id, true, 'SM123') from public.alerts_sent$$,
  'the sending result is recorded'
);
select is((select count(*)::int from public.alerts_sent where status = 'sent'), 2,
  'both alerts are marked sent');

-- The phone was offline: "taken" at 08:10 arrives at 10:00. It must win over "missed".
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select public.sync_push(p_dose_events => '[{"id":"30000000-0000-0000-0000-000000000001",
  "medication_id":"10000000-0000-0000-0000-000000000001",
  "schedule_id":"20000000-0000-0000-0000-000000000001",
  "scheduled_at":"2026-10-03T06:00:00Z","status":"taken",
  "responded_at":"2026-10-03T06:10:00Z","client_updated_at":"2026-10-03T06:10:00Z"}]'::jsonb);
reset role;
select is(
  (select status from public.dose_events where scheduled_at = '2026-10-03 06:00:00+00'),
  'taken', 'an answer given offline replaces the server''s "missed"'
);

-- Daily cap.
set local role service_role;
select is(
  (select count(*)::int from public.claim_missed_doses('2026-10-04 06:40:00+00', p_daily_cap => 3)),
  1, 'the daily cap limits the number of SMS'
);

-- STOP: the relative leaves, a pending alert is cancelled.
select public.revoke_circle_phone('+33611111111');
reset role;
insert into public.alerts_sent (user_id, dose_event_id, circle_member_id, created_at)
select '00000000-0000-0000-0000-00000000000a', e.id, '40000000-0000-0000-0000-000000000001',
       '2026-10-04 06:46:00+00'
from public.dose_events e where e.scheduled_at = '2026-10-04 06:00:00+00'
on conflict do nothing;
set local role service_role;
select is(
  (select count(*)::int from public.claim_missed_doses('2026-10-04 06:50:00+00')
   where member_first_name = 'Léa'),
  0, 'a relative who answered STOP receives nothing more'
);
select is(
  (select a.status from public.alerts_sent a join public.dose_events e on e.id = a.dose_event_id
   where e.scheduled_at = '2026-10-04 06:00:00+00' and a.circle_member_id = '40000000-0000-0000-0000-000000000001'),
  'cancelled', 'and their pending alert is cancelled'
);

-- Clock change: 25 October 2026, 08:00 in Paris is 07:00 UTC.
select results_eq(
  $$select planned_local_time from public.claim_missed_doses('2026-10-25 07:45:00+00')$$,
  $$values ('08:00')$$,
  'intakes follow the local time across the clock change'
);

-- A schedule created after the planned time: nothing was expected.
reset role;
update public.schedules set created_at = '2026-10-26 07:30:00+00'
  where id = '20000000-0000-0000-0000-000000000001';
set local role service_role;
select is(
  (select count(*)::int from public.claim_missed_doses('2026-10-26 07:45:00+00')),
  0, 'no alert for an intake planned before the schedule existed'
);

-- Changing a relative's number resets consent and invitation.
reset role;
update public.circle_members set phone_e164 = '+33633333333'
  where id = '40000000-0000-0000-0000-000000000002';
select is(
  (select consent_status || '/' || invites_sent from public.circle_members
   where id = '40000000-0000-0000-0000-000000000002'),
  'pending/0', 'a new number must accept again'
);

select * from finish();
rollback;
