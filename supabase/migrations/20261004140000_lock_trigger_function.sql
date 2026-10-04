-- handle_new_user() only runs as the sign-up trigger: nobody may call it through the API.
-- (Flagged by the Supabase security advisor: SECURITY DEFINER callable by anon.)
revoke all on function public.handle_new_user() from public, anon, authenticated;
