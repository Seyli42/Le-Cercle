-- =============================================================================
-- Le Cercle — the circle of relatives (step 6)
--
-- 1. A relative is invited by SMS and must answer "OUI" before receiving any alert
--    (consent, and protection against SMS spam to strangers).
-- 2. Every few minutes the server looks for intakes that were planned but not
--    confirmed after the delay chosen by the user, and alerts the consenting relatives.
--
-- Alert SMS never contain the medication name (medical secrecy): only the first name
-- of the person and the planned time.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema additions
-- -----------------------------------------------------------------------------

alter table public.profiles
  -- Last contact of the user's phone with the server (shown in alerts as context).
  add column last_seen_at timestamptz;

alter table public.circle_members
  add column invite_code text check (invite_code ~ '^[0-9]{4}$'),
  add column invite_sent_at timestamptz,
  add column invites_sent integer not null default 0,
  add column confirmed_at timestamptz,
  add column revoked_at timestamptz;

alter table public.alerts_sent
  add column attempts integer not null default 0,
  add column claimed_at timestamptz,
  add column sent_at timestamptz;

-- 'sending' = taken by a run of the Edge Function: never sent twice by two runs.
alter table public.alerts_sent drop constraint alerts_sent_status_check;
alter table public.alerts_sent add constraint alerts_sent_status_check
  check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled'));

-- The invitation code is a secret between the server and the relative's phone.
revoke select on public.circle_members from authenticated;
grant select (id, user_id, first_name, phone_e164, consent_status, created_at, updated_at,
              deleted_at, invite_sent_at, invites_sent, confirmed_at, revoked_at)
  on public.circle_members to authenticated;

create index circle_members_phone_idx on public.circle_members (phone_e164)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Phone heartbeat: called at every sync. Keeps the time zone used to compute the
-- planned intakes identical to the phone's.
-- -----------------------------------------------------------------------------
create or replace function public.sync_heartbeat(p_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.profiles
  set last_seen_at = now(),
      timezone = case
        when exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
          then p_timezone
        else timezone
      end
  where id = (select auth.uid());
end;
$$;

revoke all on function public.sync_heartbeat(text) from public, anon;
grant execute on function public.sync_heartbeat(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Invitation: called by the circle-invite Edge Function with the USER's session.
-- Checks ownership and rate limits, then returns what the SMS needs.
-- -----------------------------------------------------------------------------
create or replace function public.prepare_circle_invite(p_member_id uuid)
returns table (phone_e164 text, member_first_name text, patient_first_name text, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_member public.circle_members%rowtype;
  v_patient text;
  v_code text := lpad((floor(random() * 10000))::int::text, 4, '0');
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_member from public.circle_members
  where id = p_member_id and user_id = v_user and deleted_at is null
  for update;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if v_member.consent_status = 'confirmed' then
    raise exception 'already_confirmed' using errcode = 'P0001';
  end if;
  if v_member.invite_sent_at > now() - interval '2 minutes' then
    raise exception 'invite_too_soon' using errcode = 'P0001';
  end if;
  if v_member.invites_sent >= 5 then
    raise exception 'invite_limit_reached' using errcode = 'P0001';
  end if;

  select first_name into v_patient from public.profiles where id = v_user;
  if v_patient is null then
    raise exception 'first_name_required' using errcode = 'P0001';
  end if;

  update public.circle_members
  set invite_code = v_code,
      invite_sent_at = now(),
      invites_sent = invites_sent + 1,
      -- Inviting again someone who refused is allowed: they must answer OUI again.
      consent_status = 'pending',
      revoked_at = null
  where id = v_member.id;

  return query select v_member.phone_e164, v_member.first_name, v_patient, v_code;
end;
$$;

revoke all on function public.prepare_circle_invite(uuid) from public, anon;
grant execute on function public.prepare_circle_invite(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Answers received by SMS (twilio-inbound Edge Function, service role only).
-- -----------------------------------------------------------------------------

-- "OUI" (optionally followed by the code). Without code, only accepted when the phone
-- has a single pending invitation, so a "OUI" can never confirm the wrong circle.
create or replace function public.confirm_circle_invite(p_phone text, p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
  v_updated integer;
begin
  select count(*) into v_pending from public.circle_members
  where phone_e164 = p_phone and consent_status = 'pending' and deleted_at is null
    and invite_code is not null;

  if v_pending = 0 then
    return 'no_pending_invite';
  end if;
  if p_code is null and v_pending > 1 then
    return 'code_required';
  end if;

  update public.circle_members
  set consent_status = 'confirmed', confirmed_at = now(), invite_code = null
  where phone_e164 = p_phone and consent_status = 'pending' and deleted_at is null
    and invite_code is not null
    and (p_code is null or invite_code = p_code);
  get diagnostics v_updated = row_count;

  return case when v_updated > 0 then 'confirmed' else 'wrong_code' end;
end;
$$;

-- "STOP" / "NON": the number leaves every circle immediately.
create or replace function public.revoke_circle_phone(p_phone text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.circle_members
  set consent_status = 'revoked', revoked_at = now(), invite_code = null
  where phone_e164 = p_phone and consent_status <> 'revoked' and deleted_at is null;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- The consent reset on phone change must not wipe server-side consent updates.
create or replace function public.reset_circle_consent_on_phone_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone_e164 is distinct from old.phone_e164 then
    new.consent_status := 'pending';
    new.confirmed_at := null;
    new.invite_code := null;
    new.invites_sent := 0;
    new.invite_sent_at := null;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Missed intakes (missed-dose-check Edge Function, every 5 min, service role only).
--
-- Finds the intakes planned between `p_now - p_window` and `p_now - delay`, with no
-- "taken"/"skipped" answer, for users who have at least one consenting relative.
-- Marks them "missed" and creates one alert per relative (idempotent: the unique
-- constraint on alerts_sent guarantees a single SMS per relative and intake).
-- Returns the alerts to send, including those that failed before (3 attempts max).
-- -----------------------------------------------------------------------------
create or replace function public.claim_missed_doses(
  p_now timestamptz default now(),
  p_window interval default interval '6 hours',
  p_daily_cap integer default 6
)
returns table (
  alert_id uuid,
  phone_e164 text,
  member_first_name text,
  patient_first_name text,
  planned_local_time text,
  last_seen_at timestamptz,
  timezone text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1. Planned intakes, computed in each user's own time zone.
  drop table if exists _missed;
  create temporary table _missed on commit drop as
  with users as (
    select p.id as user_id, p.timezone, p.missed_dose_delay_minutes as delay_minutes
    from public.profiles p
    where exists (
      select 1 from public.circle_members c
      where c.user_id = p.id and c.consent_status = 'confirmed' and c.deleted_at is null
    )
  ),
  days as (
    select u.*, d::date as local_day
    from users u,
    generate_series(
      ((p_now - p_window) at time zone u.timezone)::date,
      (p_now at time zone u.timezone)::date,
      interval '1 day'
    ) d
  ),
  occurrences as (
    select d.user_id, d.delay_minutes, s.id as schedule_id, s.medication_id,
           ((d.local_day + s.time_of_day) at time zone d.timezone) as scheduled_at
    from days d
    join public.schedules s on s.user_id = d.user_id and s.deleted_at is null
    join public.medications m on m.id = s.medication_id and m.deleted_at is null
    where extract(isodow from d.local_day)::smallint = any (s.days_of_week)
      and d.local_day >= m.starts_on
      and (m.ends_on is null or d.local_day <= m.ends_on)
  )
  select o.* from occurrences o
  where o.scheduled_at >= p_now - p_window
    and o.scheduled_at <= p_now - make_interval(mins => o.delay_minutes)
    -- No intake was expected before the schedule existed.
    and o.scheduled_at >= (select s.created_at from public.schedules s where s.id = o.schedule_id)
    and not exists (
      select 1 from public.dose_events e
      where e.schedule_id = o.schedule_id and e.scheduled_at = o.scheduled_at
        and e.status in ('taken', 'skipped')
    );

  -- 2. Record them as missed. client_updated_at = planned time, so that any answer
  --    later uploaded by the phone (made offline, e.g. "taken" at 08:10) still wins.
  insert into public.dose_events
    (user_id, medication_id, schedule_id, scheduled_at, status, client_updated_at)
  select user_id, medication_id, schedule_id, scheduled_at, 'missed', scheduled_at
  from _missed
  on conflict (schedule_id, scheduled_at) do update set status = 'missed'
  where public.dose_events.status in ('pending', 'snoozed');

  -- 3. One alert per consenting relative, within a daily cap per user (SMS cost and
  --    respect for the relatives). The earliest intakes go first.
  insert into public.alerts_sent (user_id, dose_event_id, circle_member_id, created_at)
  select ranked.user_id, ranked.dose_event_id, ranked.member_id, p_now
  from (
    select e.user_id, e.id as dose_event_id, c.id as member_id,
           row_number() over (partition by e.user_id order by e.scheduled_at, c.id) as rank,
           (select count(*) from public.alerts_sent a
            where a.user_id = e.user_id and a.created_at > p_now - interval '24 hours') as already
    from _missed mi
    join public.dose_events e
      on e.schedule_id = mi.schedule_id and e.scheduled_at = mi.scheduled_at
    join public.circle_members c
      on c.user_id = mi.user_id and c.consent_status = 'confirmed' and c.deleted_at is null
    where not exists (
      select 1 from public.alerts_sent a2
      where a2.dose_event_id = e.id and a2.circle_member_id = c.id
    )
  ) ranked
  where ranked.already + ranked.rank <= p_daily_cap
  on conflict (dose_event_id, circle_member_id) do nothing;

  -- 4. Alerts that became useless: answered intake, or relative who left the circle.
  update public.alerts_sent a
  set status = 'cancelled'
  from public.dose_events e, public.circle_members c
  where e.id = a.dose_event_id and c.id = a.circle_member_id
    and a.status in ('queued', 'failed', 'sending')
    and (e.status in ('taken', 'skipped') or c.consent_status <> 'confirmed'
         or c.deleted_at is not null);

  -- 5. Claim the alerts to send now (new ones, failed ones up to 3 attempts, and ones a
  --    crashed run left in 'sending'). SKIP LOCKED: two runs never take the same alert.
  return query
  with due as (
    update public.alerts_sent a
    set status = 'sending', attempts = a.attempts + 1, claimed_at = p_now
    where a.id in (
      select a3.id from public.alerts_sent a3
      where a3.attempts < 3
        and a3.created_at > p_now - p_window
        and (a3.status in ('queued', 'failed')
             or (a3.status = 'sending' and a3.claimed_at < p_now - interval '10 minutes'))
      for update skip locked
    )
    returning a.id, a.user_id, a.dose_event_id, a.circle_member_id
  )
  select due.id, c.phone_e164, c.first_name, coalesce(p.first_name, 'Votre proche'),
         to_char(e.scheduled_at at time zone p.timezone, 'HH24:MI'),
         p.last_seen_at, p.timezone
  from due
  join public.circle_members c on c.id = due.circle_member_id
  join public.dose_events e on e.id = due.dose_event_id
  join public.profiles p on p.id = due.user_id;
end;
$$;

-- Result of the SMS sending, reported by the Edge Function.
create or replace function public.record_alert_result(
  p_alert_id uuid,
  p_ok boolean,
  p_provider_message_id text default null,
  p_error_code text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.alerts_sent
  set status = case when p_ok then 'sent' else 'failed' end,
      sent_at = case when p_ok then now() else sent_at end,
      provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      error_code = p_error_code
  where id = p_alert_id and status = 'sending';
$$;

revoke all on function public.confirm_circle_invite(text, text) from public, anon, authenticated;
revoke all on function public.revoke_circle_phone(text) from public, anon, authenticated;
revoke all on function public.claim_missed_doses(timestamptz, interval, integer)
  from public, anon, authenticated;
grant execute on function public.confirm_circle_invite(text, text) to service_role;
grant execute on function public.revoke_circle_phone(text) to service_role;
grant execute on function public.claim_missed_doses(timestamptz, interval, integer) to service_role;
revoke all on function public.record_alert_result(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.record_alert_result(uuid, boolean, text, text) to service_role;
