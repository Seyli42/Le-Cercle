-- =============================================================================
-- Le Cercle — AI reading of prescriptions / medication boxes (step 7)
--
-- One row per reading request: daily cap per user (cost control) and usage log
-- (tokens, for billing B2B clients). Photos are NEVER stored: neither here nor in
-- Storage. Only counters and the outcome are kept.
-- =============================================================================

create table public.ai_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'started'
    check (status in ('started', 'ok', 'unreadable', 'refused', 'error')),
  model text,
  input_tokens integer,
  output_tokens integer,
  medications_found integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index ai_extractions_user_day_idx on public.ai_extractions (user_id, created_at desc);

alter table public.ai_extractions enable row level security;
revoke all on public.ai_extractions from anon, authenticated;
grant select on public.ai_extractions to authenticated;
create policy "ai_extractions: read own" on public.ai_extractions
  for select to authenticated using (user_id = (select auth.uid()));

-- Called by the Edge Function with the USER's session, before calling the AI.
create or replace function public.begin_ai_extraction(p_daily_limit integer default 20)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- Serialise the requests of one user so the cap cannot be bypassed in parallel.
  perform pg_advisory_xact_lock(hashtext('ai_extractions:' || v_user::text));
  if (
    select count(*) from public.ai_extractions
    where user_id = v_user and created_at > now() - interval '24 hours'
  ) >= least(greatest(p_daily_limit, 1), 100) then
    raise exception 'daily_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.ai_extractions (user_id) values (v_user) returning id into v_id;
  return v_id;
end;
$$;

-- Called by the Edge Function (service role) once the AI answered.
create or replace function public.finish_ai_extraction(
  p_id uuid,
  p_status text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_medications_found integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_extractions
  set status = p_status, model = p_model, input_tokens = p_input_tokens,
      output_tokens = p_output_tokens, medications_found = p_medications_found,
      finished_at = now()
  where id = p_id and status = 'started';
$$;

revoke all on function public.begin_ai_extraction(integer) from public, anon;
grant execute on function public.begin_ai_extraction(integer) to authenticated;
revoke all on function public.finish_ai_extraction(uuid, text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.finish_ai_extraction(uuid, text, text, integer, integer, integer)
  to service_role;
