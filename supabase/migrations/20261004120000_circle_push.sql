-- =============================================================================
-- The circle without SMS: relatives are alerted by a notification on THEIR app.
--
-- Free to run (no SMS cost). The relative installs the app, creates an account and
-- enters the invitation code shared by the person (by WhatsApp, SMS from their own
-- phone…). Entering the code IS the relative's consent; either side can leave at any
-- time. Alerts never contain the medication name (medical secrecy).
--
-- Replaces the SMS circle of step 6 (circle_members, Twilio), whose tables are dropped.
-- The detection of missed intakes is unchanged (same rules, same tests).
-- =============================================================================

drop function if exists public.prepare_circle_invite(uuid);
drop function if exists public.confirm_circle_invite(text, text);
drop function if exists public.revoke_circle_phone(text);
drop function if exists public.claim_missed_doses(timestamptz, interval, integer);
drop function if exists public.record_alert_result(uuid, boolean, text, text);
drop table if exists public.alerts_sent;
drop table if exists public.circle_members;
drop function if exists public.enforce_circle_limit();
drop function if exists public.reset_circle_consent_on_phone_change();

-- The first name is what the other side sees ("Marie n'a pas confirmé…").
-- -----------------------------------------------------------------------------
-- Links: `watcher_id` is alerted when `patient_id` does not confirm an intake.
-- -----------------------------------------------------------------------------
create table public.circle_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  watcher_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (patient_id <> watcher_id)
);
create unique index circle_links_active_idx on public.circle_links (patient_id, watcher_id)
  where revoked_at is null;
create index circle_links_watcher_idx on public.circle_links (watcher_id) where revoked_at is null;

-- Invitation codes: 8 characters without ambiguous ones (no 0/O, 1/I), valid 48 h,
-- single use. Only reachable through the functions below.
create table public.circle_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  patient_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index circle_invites_patient_idx on public.circle_invites (patient_id, created_at desc);

-- Wrong codes typed, to stop anyone from guessing codes.
create table public.circle_invite_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index circle_invite_attempts_idx on public.circle_invite_attempts (user_id, created_at desc);

-- Phones that receive the alerts (Expo push tokens). A token belongs to one account:
-- signing in with another account on the same phone moves it.
create table public.push_tokens (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- One alert per relative and missed intake (audit log, written by the server only).
create table public.circle_alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  watcher_id uuid not null references auth.users (id) on delete cascade,
  dose_event_id uuid not null references public.dose_events (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  constraint circle_alerts_once unique (dose_event_id, watcher_id)
);
create index circle_alerts_patient_idx on public.circle_alerts (patient_id, created_at desc);
create index circle_alerts_watcher_idx on public.circle_alerts (watcher_id, created_at desc);

revoke all on public.circle_links, public.circle_invites, public.circle_invite_attempts,
  public.push_tokens, public.circle_alerts from public, anon, authenticated;
grant select on public.circle_links, public.circle_alerts to authenticated;

alter table public.circle_links enable row level security;
alter table public.circle_invites enable row level security;
alter table public.circle_invite_attempts enable row level security;
alter table public.push_tokens enable row level security;
alter table public.circle_alerts enable row level security;

create policy "circle_links: both sides read" on public.circle_links
  for select to authenticated
  using (patient_id = (select auth.uid()) or watcher_id = (select auth.uid()));
create policy "circle_alerts: both sides read" on public.circle_alerts
  for select to authenticated
  using (patient_id = (select auth.uid()) or watcher_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Functions called by the app (signed-in user)
-- -----------------------------------------------------------------------------

create or replace function private.require_user()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return v_user;
end;
$$;

create or replace function private.require_first_name(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select first_name into v_name from public.profiles where id = p_user;
  if v_name is null then
    raise exception 'first_name_required' using errcode = 'P0001';
  end if;
  return v_name;
end;
$$;

-- A new code for the signed-in person (the previous unused one stops working).
create or replace function public.create_circle_invite()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text := '';
begin
  perform private.require_first_name(v_user);
  perform pg_advisory_xact_lock(hashtext('circle:' || v_user::text));
  if (select count(*) from public.circle_links
      where patient_id = v_user and revoked_at is null) >= 5 then
    raise exception 'circle_full' using errcode = 'P0001';
  end if;
  if (select count(*) from public.circle_invites
      where patient_id = v_user and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'invite_limit_reached' using errcode = 'P0001';
  end if;

  update public.circle_invites set revoked_at = now()
  where patient_id = v_user and used_at is null and revoked_at is null;

  -- 8 characters from a cryptographically random UUID (32 symbols: no modulo bias).
  v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  for i in 0..7 loop
    -- Bytes 6 and 8 carry the UUID version / variant: skipped.
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, (array[0,1,2,3,4,5,10,11])[i + 1]) % 32) + 1, 1);
  end loop;

  insert into public.circle_invites (code, patient_id, expires_at)
  values (v_code, v_user, now() + interval '48 hours');
  return query select v_code, now() + interval '48 hours';
end;
$$;

-- The relative types the code: they join the person's circle (this is their consent).
create or replace function public.accept_circle_invite(p_code text)
returns table (link_id uuid, patient_first_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_invite public.circle_invites%rowtype;
  v_link uuid;
begin
  perform private.require_first_name(v_user);
  if (select count(*) from public.circle_invite_attempts
      where user_id = v_user and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  select * into v_invite from public.circle_invites i
  where i.code = v_code and i.used_at is null and i.revoked_at is null and i.expires_at > now()
  for update;
  if not found then
    -- Same answer for unknown, expired or used codes: nothing to learn by guessing.
    insert into public.circle_invite_attempts (user_id) values (v_user);
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  if v_invite.patient_id = v_user then
    raise exception 'own_invite' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('circle:' || v_invite.patient_id::text));
  select l.id into v_link from public.circle_links l
  where l.patient_id = v_invite.patient_id and l.watcher_id = v_user and l.revoked_at is null;
  if v_link is null then
    if (select count(*) from public.circle_links
        where patient_id = v_invite.patient_id and revoked_at is null) >= 5 then
      raise exception 'circle_full' using errcode = 'P0001';
    end if;
    insert into public.circle_links (patient_id, watcher_id)
    values (v_invite.patient_id, v_user) returning id into v_link;
  end if;
  update public.circle_invites set used_at = now() where code = v_invite.code;

  return query select v_link, p.first_name from public.profiles p where p.id = v_invite.patient_id;
end;
$$;

-- Either side ends the link; pending alerts are cancelled immediately.
create or replace function public.revoke_circle_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  update public.circle_links set revoked_at = now()
  where id = p_link_id and revoked_at is null
    and (patient_id = v_user or watcher_id = v_user);
  if not found then
    raise exception 'link_not_found' using errcode = 'P0002';
  end if;
  update public.circle_alerts a set status = 'cancelled'
  from public.circle_links l
  where l.id = p_link_id and a.patient_id = l.patient_id and a.watcher_id = l.watcher_id
    and a.status in ('queued', 'failed', 'sending');
end;
$$;

-- Both lists of the signed-in person, with the other side's first name only.
create or replace function public.my_circle()
returns table (link_id uuid, role text, first_name text, since timestamptz, last_alert_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, 'watcher', coalesce(p.first_name, '?'), l.created_at, null::timestamptz
  from public.circle_links l
  join public.profiles p on p.id = l.watcher_id
  where l.patient_id = (select auth.uid()) and l.revoked_at is null
  union all
  select l.id, 'patient', coalesce(p.first_name, '?'), l.created_at,
         (select max(a.sent_at) from public.circle_alerts a
          where a.patient_id = l.patient_id and a.watcher_id = l.watcher_id)
  from public.circle_links l
  join public.profiles p on p.id = l.patient_id
  where l.watcher_id = (select auth.uid()) and l.revoked_at is null
  order by 2, 4
$$;

-- The code currently valid, if any (to show it again).
create or replace function public.my_circle_invite()
returns table (code text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.code, i.expires_at from public.circle_invites i
  where i.patient_id = (select auth.uid()) and i.used_at is null and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
$$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
begin
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (p_token, v_user, p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
  -- At most 10 phones per account: the oldest ones go.
  delete from public.push_tokens t
  where t.user_id = v_user and t.token in (
    select t2.token from public.push_tokens t2 where t2.user_id = v_user
    order by t2.updated_at desc offset 10
  );
end;
$$;

-- Sign-out on this phone: no more alerts here.
create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = (select auth.uid());
$$;

-- Helpers only used inside the functions above (which run as their owner).
revoke all on function private.require_user() from public, anon, authenticated;
revoke all on function private.require_first_name(uuid) from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.create_circle_invite()',
    'public.accept_circle_invite(text)',
    'public.revoke_circle_link(uuid)',
    'public.my_circle()',
    'public.my_circle_invite()',
    'public.register_push_token(text, text)',
    'public.unregister_push_token(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Missed intakes (missed-dose-check Edge Function, every 5 min, service role only).
-- Same detection as step 6; recipients are now the watchers' phones.
-- -----------------------------------------------------------------------------
create or replace function public.claim_missed_doses(
  p_now timestamptz default now(),
  p_window interval default interval '6 hours',
  p_daily_cap integer default 6
)
returns table (
  alert_id uuid,
  patient_first_name text,
  planned_local_time text,
  last_seen_at timestamptz,
  timezone text,
  tokens text[]
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
      select 1 from public.circle_links l where l.patient_id = p.id and l.revoked_at is null
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

  -- 3. One alert per watcher, within a daily cap per person (respect for the
  --    relatives). The earliest intakes go first.
  insert into public.circle_alerts (patient_id, watcher_id, dose_event_id, created_at)
  select ranked.patient_id, ranked.watcher_id, ranked.dose_event_id, p_now
  from (
    select e.user_id as patient_id, l.watcher_id, e.id as dose_event_id,
           row_number() over (partition by e.user_id order by e.scheduled_at, l.watcher_id) as rank,
           (select count(*) from public.circle_alerts a
            where a.patient_id = e.user_id and a.created_at > p_now - interval '24 hours') as already
    from _missed mi
    join public.dose_events e
      on e.schedule_id = mi.schedule_id and e.scheduled_at = mi.scheduled_at
    join public.circle_links l on l.patient_id = mi.user_id and l.revoked_at is null
    where not exists (
      select 1 from public.circle_alerts a2
      where a2.dose_event_id = e.id and a2.watcher_id = l.watcher_id
    )
  ) ranked
  where ranked.already + ranked.rank <= p_daily_cap
  on conflict (dose_event_id, watcher_id) do nothing;

  -- 4. Alerts that became useless: answered intake, or link ended.
  update public.circle_alerts a
  set status = 'cancelled'
  from public.dose_events e
  where e.id = a.dose_event_id
    and a.status in ('queued', 'failed', 'sending')
    and (e.status in ('taken', 'skipped') or not exists (
      select 1 from public.circle_links l
      where l.patient_id = a.patient_id and l.watcher_id = a.watcher_id and l.revoked_at is null
    ));

  -- 5. Claim the alerts to send now (new ones, failed ones up to 3 attempts, and ones a
  --    crashed run left in 'sending'). SKIP LOCKED: two runs never take the same alert.
  return query
  with due as (
    update public.circle_alerts a
    set status = 'sending', attempts = a.attempts + 1, claimed_at = p_now
    where a.id in (
      select a3.id from public.circle_alerts a3
      where a3.attempts < 3
        and a3.created_at > p_now - p_window
        and (a3.status in ('queued', 'failed')
             or (a3.status = 'sending' and a3.claimed_at < p_now - interval '10 minutes'))
      for update skip locked
    )
    returning a.id, a.patient_id, a.watcher_id, a.dose_event_id
  )
  select due.id, coalesce(p.first_name, 'Votre proche'),
         to_char(e.scheduled_at at time zone p.timezone, 'HH24:MI'),
         p.last_seen_at, p.timezone,
         coalesce((select array_agg(t.token order by t.updated_at desc)
                   from public.push_tokens t where t.user_id = due.watcher_id), '{}')
  from due
  join public.dose_events e on e.id = due.dose_event_id
  join public.profiles p on p.id = due.patient_id;
end;
$$;

-- Result of the sending, reported by the Edge Function.
create or replace function public.record_alert_result(
  p_alert_id uuid,
  p_ok boolean,
  p_error_code text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.circle_alerts
  set status = case when p_ok then 'sent' else 'failed' end,
      sent_at = case when p_ok then now() else sent_at end,
      error_code = p_error_code
  where id = p_alert_id and status = 'sending';
$$;

-- Phones uninstalled or signed out at Apple / Google: forgotten.
create or replace function public.forget_push_tokens(p_tokens text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = any (p_tokens);
$$;

revoke all on function public.claim_missed_doses(timestamptz, interval, integer)
  from public, anon, authenticated;
revoke all on function public.record_alert_result(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.forget_push_tokens(text[]) from public, anon, authenticated;
grant execute on function public.claim_missed_doses(timestamptz, interval, integer) to service_role;
grant execute on function public.record_alert_result(uuid, boolean, text) to service_role;
grant execute on function public.forget_push_tokens(text[]) to service_role;
