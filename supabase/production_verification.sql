-- Run these checks in the Supabase SQL editor after running wordwiz_schema.sql.
-- They should return rows showing RLS enabled and user-scoped policies present.

select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'words',
    'quiz_attempts',
    'card_reviews',
    'reminder_settings'
  )
order by tablename;

select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'words',
    'quiz_attempts',
    'card_reviews',
    'reminder_settings'
  )
order by tablename, policyname;

-- Expected result:
-- 1. Every row in the first query has rowsecurity = true.
-- 2. Policies use auth.uid() = user_id for all user-owned rows.
-- 3. No policy grants broad public access like "true" for these tables.
