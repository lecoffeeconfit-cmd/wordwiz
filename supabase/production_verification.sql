-- Run these checks in the Supabase SQL editor after the access migrations.
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

-- Word saving depends on these tables and server-side RPCs. If either query is
-- missing a row, apply the SQL files in their documented order before release.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'words',
    'word_addition_usage',
    'subscription_entitlements',
    'complimentary_access'
  )
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_word_with_monthly_limit',
    'create_words_with_monthly_limit',
    'set_study_set_membership',
    'get_or_start_my_access'
  )
order by routine_name;

-- Expected result: four table rows and four RPC rows above.
