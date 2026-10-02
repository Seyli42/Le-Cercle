-- Offline sync: last write wins, atomic batches, and no way to touch another account.
begin;
select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';

-- A first upload from Alice's phone (offline creation).
select is(
  public.sync_push(
    '[{"id":"10000000-0000-0000-0000-000000000001","name":"Doliprane","form":"tablet",
       "dose_label":"1 comprimé","starts_on":"2026-10-01","ends_on":null,"notes":null,
       "deleted_at":null,"client_updated_at":"2026-10-02T08:00:00Z",
       "user_id":"00000000-0000-0000-0000-00000000000b"}]'::jsonb,
    '[{"id":"20000000-0000-0000-0000-000000000001",
       "medication_id":"10000000-0000-0000-0000-000000000001","time_of_day":"08:00",
       "days_of_week":[1,2,3,4,5,6,7],"deleted_at":null,
       "client_updated_at":"2026-10-02T08:00:00Z"}]'::jsonb,
    '[{"id":"30000000-0000-0000-0000-000000000001",
       "medication_id":"10000000-0000-0000-0000-000000000001",
       "schedule_id":"20000000-0000-0000-0000-000000000001",
       "scheduled_at":"2026-10-02T06:00:00Z","status":"taken",
       "responded_at":"2026-10-02T06:03:00Z","client_updated_at":"2026-10-02T06:03:00Z"}]'::jsonb
  ),
  '{"medications":1,"schedules":1,"dose_events":1}'::jsonb,
  'a batch created offline is uploaded'
);
select is(
  (select user_id from public.medications where id = '10000000-0000-0000-0000-000000000001'),
  '00000000-0000-0000-0000-00000000000a'::uuid,
  'the owner comes from the session, never from the payload'
);
select is(
  (select days_of_week from public.schedules where id = '20000000-0000-0000-0000-000000000001'),
  '{1,2,3,4,5,6,7}'::smallint[],
  'weekdays arrive as a Postgres array'
);

-- An OLDER change (phone that stayed offline longer) must not overwrite a newer one.
select is(
  (public.sync_push(
    '[{"id":"10000000-0000-0000-0000-000000000001","name":"Ancien nom","form":"tablet",
       "dose_label":"1 comprimé","starts_on":"2026-10-01","client_updated_at":"2026-10-02T07:00:00Z"}]'::jsonb
  ) ->> 'medications')::int,
  0,
  'an older change is ignored'
);
select is(
  (select name from public.medications where id = '10000000-0000-0000-0000-000000000001'),
  'Doliprane',
  'the newer value is kept'
);

-- A NEWER change wins.
select public.sync_push(
  '[{"id":"10000000-0000-0000-0000-000000000001","name":"Doliprane 1000","form":"tablet",
     "dose_label":"1 comprimé","starts_on":"2026-10-01","client_updated_at":"2026-10-02T09:00:00Z"}]'::jsonb
);
select is(
  (select name from public.medications where id = '10000000-0000-0000-0000-000000000001'),
  'Doliprane 1000',
  'a newer change replaces the value'
);

-- The same intake recorded by a second phone (different local id) stays a single row.
select public.sync_push(
  p_dose_events => '[{"id":"30000000-0000-0000-0000-000000000099",
     "medication_id":"10000000-0000-0000-0000-000000000001",
     "schedule_id":"20000000-0000-0000-0000-000000000001",
     "scheduled_at":"2026-10-02T06:00:00Z","status":"skipped",
     "responded_at":"2026-10-02T06:10:00Z","client_updated_at":"2026-10-02T06:10:00Z"}]'::jsonb
);
select results_eq(
  'select id::text, status from public.dose_events',
  $$values ('30000000-0000-0000-0000-000000000001', 'skipped')$$,
  'one row per intake, with the most recent answer'
);

-- Invalid rows: the whole batch is refused (nothing half-written).
select throws_ok(
  $$select public.sync_push(
    '[{"id":"10000000-0000-0000-0000-000000000002","name":"Valide","form":"tablet",
       "dose_label":"1","starts_on":"2026-10-01","client_updated_at":"2026-10-02T10:00:00Z"}]'::jsonb,
    '[{"id":"20000000-0000-0000-0000-000000000002",
       "medication_id":"10000000-0000-0000-0000-000000000002","time_of_day":"09:00",
       "days_of_week":[9],"client_updated_at":"2026-10-02T10:00:00Z"}]'::jsonb)$$,
  '23514', null,
  'a batch with an invalid row is rejected'
);
select is(
  (select count(*)::int from public.medications where id = '10000000-0000-0000-0000-000000000002'),
  0,
  'and nothing of it was saved'
);
select throws_ok(
  $$select public.sync_push((select jsonb_agg(jsonb_build_object('id', gen_random_uuid()))
                             from generate_series(1, 501)))$$,
  '54000', null,
  'oversized batches are refused'
);

-- Download: only changes after the cursor, in order.
select is(
  jsonb_array_length(public.sync_pull() -> 'medications'),
  1,
  'a first download returns everything'
);
select is(
  public.sync_pull() -> 'schedules' -> 0 ->> 'time_of_day',
  '08:00',
  'times are downloaded as HH:MM'
);
select is(
  jsonb_array_length(public.sync_pull(jsonb_build_object('medications', jsonb_build_object(
    'ts', (select updated_at from public.medications limit 1),
    'id', (select id from public.medications limit 1)))) -> 'medications'),
  0,
  'nothing new after the cursor'
);

-- Bob cannot read nor overwrite anything of Alice's through the sync functions.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
select is(
  public.sync_pull() -> 'medications',
  '[]'::jsonb,
  'Bob downloads nothing of Alice'
);
select throws_ok(
  $$select public.sync_push(
    '[{"id":"10000000-0000-0000-0000-000000000001","name":"Piraté","form":"tablet",
       "dose_label":"1","starts_on":"2026-10-01","client_updated_at":"2030-01-01T00:00:00Z"}]'::jsonb)$$,
  '42501', null,
  'Bob cannot overwrite Alice''s medication, even with a future timestamp'
);

set local role anon;
set local request.jwt.claims = '{}';
select throws_ok('select public.sync_pull()', '42501', null, 'signed-out callers cannot sync');

reset role;
select is(
  (select name from public.medications where id = '10000000-0000-0000-0000-000000000001'),
  'Doliprane 1000',
  'Alice''s data is untouched'
);

select * from finish();
rollback;
