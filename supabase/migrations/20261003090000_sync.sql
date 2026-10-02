-- =============================================================================
-- Le Cercle — offline synchronisation (step 5)
--
-- The phone is the source of truth while offline. Each row carries the time it was
-- changed ON THE PHONE (`client_updated_at`): when two devices changed the same row,
-- the most recent change wins ("last write wins"), whatever the order of arrival.
--
-- `updated_at` stays the server time of the last write: it is the cursor used by the
-- phones to download what changed since their last synchronisation.
--
-- Both functions run with the caller's rights (security invoker): Row Level Security
-- still applies, a user can only push and pull their own rows.
-- =============================================================================

alter table public.medications
  add column client_updated_at timestamptz not null default now();
alter table public.schedules
  add column client_updated_at timestamptz not null default now();
alter table public.dose_events
  add column client_updated_at timestamptz not null default now();

-- Keyset pagination of the downloads: (updated_at, id) per user.
create index medications_sync_idx on public.medications (user_id, updated_at, id);
create index schedules_sync_idx on public.schedules (user_id, updated_at, id);
create index dose_events_sync_idx on public.dose_events (user_id, updated_at, id);

grant update (client_updated_at) on public.medications, public.schedules, public.dose_events
  to authenticated;

-- -----------------------------------------------------------------------------
-- sync_push: uploads the changes made on the phone, atomically (all or nothing).
-- -----------------------------------------------------------------------------
create or replace function public.sync_push(
  p_medications jsonb default '[]'::jsonb,
  p_schedules jsonb default '[]'::jsonb,
  p_dose_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_medications integer;
  v_schedules integer;
  v_dose_events integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_medications) <> 'array'
     or jsonb_typeof(p_schedules) <> 'array'
     or jsonb_typeof(p_dose_events) <> 'array' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if jsonb_array_length(p_medications) + jsonb_array_length(p_schedules)
     + jsonb_array_length(p_dose_events) > 500 then
    raise exception 'batch_too_large' using errcode = '54000',
      hint = 'Send at most 500 rows per call.';
  end if;

  -- Parents first: schedules reference medications, intakes reference both.
  -- user_id always comes from the session, never from the payload.
  insert into public.medications as t (
    id, user_id, name, form, dose_label, starts_on, ends_on, notes, deleted_at, client_updated_at
  )
  select r.id, v_user, r.name, r.form, r.dose_label, r.starts_on, r.ends_on, r.notes,
         r.deleted_at, r.client_updated_at
  from jsonb_to_recordset(p_medications) as r(
    id uuid, name text, form text, dose_label text, starts_on date, ends_on date, notes text,
    deleted_at timestamptz, client_updated_at timestamptz
  )
  on conflict (id) do update set
    name = excluded.name,
    form = excluded.form,
    dose_label = excluded.dose_label,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    notes = excluded.notes,
    deleted_at = excluded.deleted_at,
    client_updated_at = excluded.client_updated_at
  where t.client_updated_at < excluded.client_updated_at;
  get diagnostics v_medications = row_count;

  insert into public.schedules as t (
    id, user_id, medication_id, time_of_day, days_of_week, deleted_at, client_updated_at
  )
  select r.id, v_user, r.medication_id, r.time_of_day, r.days_of_week, r.deleted_at,
         r.client_updated_at
  from jsonb_to_recordset(p_schedules) as r(
    id uuid, medication_id uuid, time_of_day time, days_of_week smallint[],
    deleted_at timestamptz, client_updated_at timestamptz
  )
  on conflict (id) do update set
    time_of_day = excluded.time_of_day,
    days_of_week = excluded.days_of_week,
    deleted_at = excluded.deleted_at,
    client_updated_at = excluded.client_updated_at
  where t.client_updated_at < excluded.client_updated_at;
  get diagnostics v_schedules = row_count;

  -- One intake = one (schedule, planned time), whichever phone recorded it first.
  insert into public.dose_events as t (
    id, user_id, medication_id, schedule_id, scheduled_at, status, responded_at, client_updated_at
  )
  select r.id, v_user, r.medication_id, r.schedule_id, r.scheduled_at, r.status,
         r.responded_at, r.client_updated_at
  from jsonb_to_recordset(p_dose_events) as r(
    id uuid, medication_id uuid, schedule_id uuid, scheduled_at timestamptz, status text,
    responded_at timestamptz, client_updated_at timestamptz
  )
  on conflict (schedule_id, scheduled_at) do update set
    status = excluded.status,
    responded_at = excluded.responded_at,
    client_updated_at = excluded.client_updated_at
  where t.client_updated_at < excluded.client_updated_at;
  get diagnostics v_dose_events = row_count;

  return jsonb_build_object(
    'medications', v_medications,
    'schedules', v_schedules,
    'dose_events', v_dose_events
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- sync_pull: downloads the rows changed after a cursor, per table.
-- Cursor = the (updated_at, id) of the last row received; rows come in that order.
-- -----------------------------------------------------------------------------
create or replace function public.sync_pull(
  p_cursors jsonb default '{}'::jsonb,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  v_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_result jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_ts timestamptz;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  v_ts := coalesce((p_cursors -> 'medications' ->> 'ts')::timestamptz, '-infinity');
  v_id := coalesce((p_cursors -> 'medications' ->> 'id')::uuid, v_zero);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at, x.id), '[]'::jsonb) into v_rows
  from (
    select id, user_id, name, form, dose_label, starts_on, ends_on, notes, deleted_at,
           client_updated_at, updated_at
    from public.medications
    where (updated_at, id) > (v_ts, v_id)
    order by updated_at, id
    limit v_limit
  ) x;
  v_result := v_result || jsonb_build_object('medications', v_rows);

  v_ts := coalesce((p_cursors -> 'schedules' ->> 'ts')::timestamptz, '-infinity');
  v_id := coalesce((p_cursors -> 'schedules' ->> 'id')::uuid, v_zero);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at, x.id), '[]'::jsonb) into v_rows
  from (
    select id, user_id, medication_id, to_char(time_of_day, 'HH24:MI') as time_of_day,
           days_of_week, deleted_at, client_updated_at, updated_at
    from public.schedules
    where (updated_at, id) > (v_ts, v_id)
    order by updated_at, id
    limit v_limit
  ) x;
  v_result := v_result || jsonb_build_object('schedules', v_rows);

  v_ts := coalesce((p_cursors -> 'dose_events' ->> 'ts')::timestamptz, '-infinity');
  v_id := coalesce((p_cursors -> 'dose_events' ->> 'id')::uuid, v_zero);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at, x.id), '[]'::jsonb) into v_rows
  from (
    select id, user_id, medication_id, schedule_id, scheduled_at, status, responded_at,
           client_updated_at, updated_at
    from public.dose_events
    where (updated_at, id) > (v_ts, v_id)
    order by updated_at, id
    limit v_limit
  ) x;
  v_result := v_result || jsonb_build_object('dose_events', v_rows);

  return v_result || jsonb_build_object('limit', v_limit);
end;
$$;

revoke all on function public.sync_push(jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.sync_pull(jsonb, integer) from public, anon;
grant execute on function public.sync_push(jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.sync_pull(jsonb, integer) to authenticated;
