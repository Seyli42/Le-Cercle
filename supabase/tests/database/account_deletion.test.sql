-- Deleting an account deletes ALL of its data (GDPR right to erasure), and only it.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

-- Alice and Bob each get one row in every table.
insert into public.medications (id, user_id, name, dose_label) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'A', '1'),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'B', '1');
insert into public.schedules (id, user_id, medication_id, time_of_day) values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '08:00'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '08:00');
insert into public.dose_events (id, user_id, medication_id, schedule_id, scheduled_at, status) values
  ('30000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-00000000000a', now(), 'missed'),
  ('30000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-00000000000b', now(), 'missed');
insert into public.circle_links (patient_id, watcher_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
insert into public.circle_alerts (patient_id, watcher_id, dose_event_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '30000000-0000-0000-0000-00000000000a');
insert into public.push_tokens (token, user_id, platform) values
  ('ExponentPushToken[alice-phone-1234]', '00000000-0000-0000-0000-00000000000a', 'ios'),
  ('ExponentPushToken[bob-phone-12345]', '00000000-0000-0000-0000-00000000000b', 'ios');

-- What the delete-account function does (auth.admin.deleteUser).
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';

select is((select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 0, 'profile deleted');
select is((select count(*)::int from public.medications where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'medications deleted');
select is((select count(*)::int from public.schedules where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'schedules deleted');
select is((select count(*)::int from public.dose_events where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'intake history deleted');
select is((select count(*)::int from public.circle_links), 0, 'circle links deleted');
select is((select count(*)::int from public.circle_alerts), 0, 'alert log deleted');

-- Bob is untouched.
select is((select count(*)::int from public.medications where user_id = '00000000-0000-0000-0000-00000000000b'), 1, 'other accounts keep their medications');
select is((select count(*)::int from public.push_tokens where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'phones forgotten');
select is((select count(*)::int from public.push_tokens), 1, 'other accounts keep their phones');

select * from finish();
rollback;
