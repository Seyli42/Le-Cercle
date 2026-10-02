-- =============================================================================
-- Le Cercle — initial schema
--
-- Security model:
--   * Row Level Security on every table: a user only ever sees their own rows.
--   * The `anon` role (signed-out requests) has no access at all.
--   * `alerts_sent` is written only by Edge Functions (service_role).
--   * Ids are UUIDs that the phone can generate offline, so rows created without
--     network keep the same id once synced.
--   * Rows are soft-deleted (`deleted_at`) so other devices learn about deletions.
--
-- Free-text medical fields are stored exactly as the user typed them: the app
-- never interprets doses.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: one row per account, created automatically at sign-up
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text check (char_length(first_name) between 1 and 50),
  timezone text not null default 'Europe/Paris' check (char_length(timezone) between 1 and 64),
  -- How long an unconfirmed dose waits before the circle is alerted.
  missed_dose_delay_minutes integer not null default 30
    check (missed_dose_delay_minutes between 10 and 240),
  -- GDPR art. 9: explicit consent to process health data.
  health_data_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- medications
-- -----------------------------------------------------------------------------

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  form text not null default 'other'
    check (form in ('tablet', 'capsule', 'liquid', 'drops', 'injection', 'inhaler', 'patch', 'cream', 'other')),
  -- Exactly what the user typed, e.g. "1 comprimé", "5 ml". Never computed.
  dose_label text not null check (char_length(btrim(dose_label)) between 1 and 50),
  starts_on date not null default current_date,
  ends_on date,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint medications_dates_ok check (ends_on is null or ends_on >= starts_on),
  -- Lets child tables prove they belong to the same user (composite foreign keys).
  constraint medications_id_user_unique unique (id, user_id)
);

create index medications_user_id_idx on public.medications (user_id);

create trigger medications_set_updated_at
  before update on public.medications
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- schedules: when a medication must be taken (local time of the user)
-- -----------------------------------------------------------------------------

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medication_id uuid not null,
  time_of_day time without time zone not null,
  -- ISO weekdays: 1 = Monday … 7 = Sunday.
  days_of_week smallint[] not null default '{1,2,3,4,5,6,7}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint schedules_days_valid check (
    cardinality(days_of_week) between 1 and 7
    and days_of_week <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
  ),
  constraint schedules_medication_fk foreign key (medication_id, user_id)
    references public.medications (id, user_id) on delete cascade,
  constraint schedules_id_user_unique unique (id, user_id)
);

create index schedules_user_id_idx on public.schedules (user_id);
create index schedules_medication_id_idx on public.schedules (medication_id);

create trigger schedules_set_updated_at
  before update on public.schedules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- dose_events: one row per expected intake and what happened to it
-- -----------------------------------------------------------------------------

create table public.dose_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  medication_id uuid not null,
  schedule_id uuid not null,
  scheduled_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'taken', 'snoozed', 'skipped', 'missed')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dose_events_medication_fk foreign key (medication_id, user_id)
    references public.medications (id, user_id) on delete cascade,
  constraint dose_events_schedule_fk foreign key (schedule_id, user_id)
    references public.schedules (id, user_id) on delete cascade,
  -- Makes offline sync idempotent: one event per schedule occurrence.
  constraint dose_events_occurrence_unique unique (schedule_id, scheduled_at)
);

create index dose_events_user_scheduled_idx on public.dose_events (user_id, scheduled_at desc);
create index dose_events_medication_id_idx on public.dose_events (medication_id);
-- Used by the missed-dose cron job (step 6).
create index dose_events_pending_idx on public.dose_events (scheduled_at)
  where status in ('pending', 'snoozed');

create trigger dose_events_set_updated_at
  before update on public.dose_events
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- circle_members: relatives alerted by SMS (max 5 active per user)
-- -----------------------------------------------------------------------------

create table public.circle_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 50),
  -- E.164 format, e.g. +33612345678.
  phone_e164 text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  -- The relative must opt in by SMS before receiving alerts (step 6).
  consent_status text not null default 'pending'
    check (consent_status in ('pending', 'confirmed', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint circle_members_id_user_unique unique (id, user_id)
);

create index circle_members_user_id_idx on public.circle_members (user_id);
create unique index circle_members_unique_phone_idx on public.circle_members (user_id, phone_e164)
  where deleted_at is null;

create trigger circle_members_set_updated_at
  before update on public.circle_members
  for each row execute function public.set_updated_at();

create or replace function public.enforce_circle_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialise concurrent inserts for the same user so the limit cannot be bypassed.
  perform pg_advisory_xact_lock(hashtext('circle_members:' || new.user_id::text));
  if new.deleted_at is null and (
    select count(*) from public.circle_members
    where user_id = new.user_id and deleted_at is null and id <> new.id
  ) >= 5 then
    raise exception 'circle_limit_reached' using errcode = 'P0001',
      hint = 'Un cercle compte au maximum 5 proches.';
  end if;
  return new;
end;
$$;

create trigger circle_members_limit
  before insert or update of deleted_at on public.circle_members
  for each row execute function public.enforce_circle_limit();

-- A new phone number means a new person: they must opt in again before any alert.
create or replace function public.reset_circle_consent_on_phone_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone_e164 is distinct from old.phone_e164 then
    new.consent_status := 'pending';
  end if;
  return new;
end;
$$;

create trigger circle_members_reset_consent
  before update of phone_e164 on public.circle_members
  for each row execute function public.reset_circle_consent_on_phone_change();

-- -----------------------------------------------------------------------------
-- alerts_sent: audit log of SMS sent to the circle (written by Edge Functions)
-- -----------------------------------------------------------------------------

create table public.alerts_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dose_event_id uuid not null,
  circle_member_id uuid not null,
  channel text not null default 'sms' check (channel in ('sms')),
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  constraint alerts_sent_member_fk foreign key (circle_member_id, user_id)
    references public.circle_members (id, user_id) on delete cascade,
  constraint alerts_sent_dose_event_fk foreign key (dose_event_id)
    references public.dose_events (id) on delete cascade,
  -- Never alert the same relative twice for the same missed dose.
  constraint alerts_sent_once unique (dose_event_id, circle_member_id)
);

create index alerts_sent_user_id_idx on public.alerts_sent (user_id);
create index alerts_sent_member_idx on public.alerts_sent (circle_member_id);

-- =============================================================================
-- Privileges and Row Level Security
-- =============================================================================

revoke all on public.profiles, public.medications, public.schedules, public.dose_events,
  public.circle_members, public.alerts_sent from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.medications, public.schedules,
  public.dose_events, public.circle_members to authenticated;
grant select on public.alerts_sent to authenticated;

-- Users may only change their own settings, never the account id or timestamps.
revoke update on public.profiles from authenticated;
grant update (first_name, timezone, missed_dose_delay_minutes, health_data_consent_at)
  on public.profiles to authenticated;

-- A relative's consent can only be changed by the SMS opt-in flow (service_role).
revoke update on public.circle_members from authenticated;
grant update (first_name, phone_e164, deleted_at) on public.circle_members to authenticated;

alter table public.profiles enable row level security;
alter table public.medications enable row level security;
alter table public.schedules enable row level security;
alter table public.dose_events enable row level security;
alter table public.circle_members enable row level security;
alter table public.alerts_sent enable row level security;

-- `(select auth.uid())` is evaluated once per query instead of once per row.

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "medications: read own" on public.medications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "medications: insert own" on public.medications
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "medications: update own" on public.medications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "medications: delete own" on public.medications
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "schedules: read own" on public.schedules
  for select to authenticated using (user_id = (select auth.uid()));
create policy "schedules: insert own" on public.schedules
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "schedules: update own" on public.schedules
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "schedules: delete own" on public.schedules
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "dose_events: read own" on public.dose_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "dose_events: insert own" on public.dose_events
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dose_events: update own" on public.dose_events
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dose_events: delete own" on public.dose_events
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "circle_members: read own" on public.circle_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "circle_members: insert own" on public.circle_members
  for insert to authenticated
  with check (user_id = (select auth.uid()) and consent_status = 'pending');
create policy "circle_members: update own" on public.circle_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "circle_members: delete own" on public.circle_members
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "alerts_sent: read own" on public.alerts_sent
  for select to authenticated using (user_id = (select auth.uid()));
