-- The prescription scan (AI reading, step 7) is removed: too costly for a free app.
-- Its usage log and quota functions go with it. (The code stays in git history if the
-- feature comes back, e.g. for Premium only.)
drop function if exists public.finish_ai_extraction(uuid, text, text, integer, integer, integer);
drop function if exists public.begin_ai_extraction(integer);
drop table if exists public.ai_extractions;
