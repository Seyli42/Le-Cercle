-- The app speaks 11 languages (src/i18n). Each phone registers its language, so that a
-- relative is alerted in THEIR language (not the one of the person they watch over).

alter table public.push_tokens
  add column locale text not null default 'en'
    check (locale in ('fr', 'en', 'es', 'pt', 'zh', 'ja', 'ru', 'ar', 'hi', 'id', 'ms'));

drop function if exists public.register_push_token(text, text);
create or replace function public.register_push_token(
  p_token text,
  p_platform text,
  p_locale text default 'en'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := private.require_user();
  v_locale text := case
    when p_locale in ('fr', 'en', 'es', 'pt', 'zh', 'ja', 'ru', 'ar', 'hi', 'id', 'ms') then p_locale
    else 'en'
  end;
begin
  insert into public.push_tokens (token, user_id, platform, locale, updated_at)
  values (p_token, v_user, p_platform, v_locale, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, locale = excluded.locale,
        updated_at = now();
  -- At most 10 phones per account: the oldest ones go.
  delete from public.push_tokens t
  where t.user_id = v_user and t.token in (
    select t2.token from public.push_tokens t2 where t2.user_id = v_user
    order by t2.updated_at desc offset 10
  );
end;
$$;
revoke all on function public.register_push_token(text, text, text) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;

-- Language of each phone to alert (missed-dose-check Edge Function, service role only).
create or replace function public.push_token_locales(p_tokens text[])
returns table (token text, locale text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.token, t.locale from public.push_tokens t where t.token = any (p_tokens);
$$;
revoke all on function public.push_token_locales(text[]) from public, anon, authenticated;
grant execute on function public.push_token_locales(text[]) to service_role;
