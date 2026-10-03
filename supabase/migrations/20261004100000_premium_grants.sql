-- Premium given without an in-app purchase: B2B contracts (a pharmacy, a mutual insurer
-- or a care home offers Le Cercle without ads to its patients), gifts, support gestures.
-- Store subscriptions themselves are handled by RevenueCat in the app.
--
-- Written only by the administrator (SQL editor / service_role), read by the person.
-- Example:
--   insert into public.premium_grants (user_id, ends_at, reason)
--   values ('<user id>', '2027-12-31', 'Pharmacie du Centre — contrat 2027');

create table public.premium_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  starts_at timestamptz not null default now(),
  -- null = no end date.
  ends_at timestamptz,
  reason text not null check (char_length(reason) between 1 and 200),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index premium_grants_user_id_idx on public.premium_grants (user_id);

revoke all on public.premium_grants from public, anon, authenticated;
grant select on public.premium_grants to authenticated;
alter table public.premium_grants enable row level security;
create policy "premium_grants: read own"
  on public.premium_grants for select to authenticated
  using (user_id = (select auth.uid()));

-- The grant in force for the signed-in person, if any (the one that lasts longest).
create or replace function public.my_premium_grant()
returns table (ends_at timestamptz, reason text)
language sql
stable
security invoker
set search_path = ''
as $$
  select g.ends_at, g.reason
  from public.premium_grants g
  where g.user_id = (select auth.uid())
    and g.starts_at <= now()
    and (g.ends_at is null or g.ends_at > now())
  order by g.ends_at desc nulls first
  limit 1
$$;
revoke all on function public.my_premium_grant() from public, anon;
grant execute on function public.my_premium_grant() to authenticated;
