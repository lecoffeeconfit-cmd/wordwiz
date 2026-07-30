-- WordWiz admin console. Apply after the existing schema and access migrations.
-- Admin membership is intentionally separate from auth metadata so no mobile
-- client can promote itself. All user-management happens in the Edge Function.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid,
  target_user_id uuid,
  action text not null check (action in (
    'reset_free_tier',
    'grant_complimentary_access',
    'delete_user'
  )),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Foreground-only screen sessions make navigation insights useful without
-- collecting taps, text, or a learner's detailed browsing history.
create table if not exists public.screen_time_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  screen text not null check (screen in ('home', 'words', 'cards', 'quiz', 'dashboard')),
  duration_seconds integer not null check (duration_seconds between 3 and 14400),
  started_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists screen_time_sessions_started_at_idx
  on public.screen_time_sessions(started_at desc);

alter table public.app_admins enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.screen_time_sessions enable row level security;

-- There are deliberately no client table policies. Learners only need the
-- boolean RPC below; the service-role Edge Function performs every mutation.
create or replace function public.is_my_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = auth.uid()
  );
$$;

create or replace function public.record_my_screen_time(
  p_screen text,
  p_duration_seconds integer,
  p_started_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_screen not in ('home', 'words', 'cards', 'quiz', 'dashboard') then
    raise exception 'invalid_screen' using errcode = '22023';
  end if;
  if p_duration_seconds < 3 or p_duration_seconds > 14400 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;

  insert into public.screen_time_sessions (user_id, screen, duration_seconds, started_at)
  values (auth.uid(), p_screen, p_duration_seconds, p_started_at);
end;
$$;

-- A compact aggregate used by the protected Edge Function. It avoids moving
-- every learner record to a phone just to render operations insights.
create or replace function public.admin_dashboard_metrics()
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  select jsonb_build_object(
    'totalUsers', (select count(*) from auth.users),
    'newUsers7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'activeUsers7d', (
      select count(distinct user_id) from (
        select user_id from public.quiz_attempts where completed_at >= now() - interval '7 days'
        union
        select user_id from public.card_reviews where studied_at >= now() - interval '7 days'
        union
        select user_id from public.words where updated_at >= now() - interval '7 days'
      ) active_users
    ),
    'savedWords', (select count(*) from public.words),
    'quizAttempts7d', (select count(*) from public.quiz_attempts where completed_at >= now() - interval '7 days'),
    'cardReviews7d', (select count(*) from public.card_reviews where studied_at >= now() - interval '7 days'),
    'quizAccuracy30d', coalesce((
      select round(100.0 * sum(score)::numeric / nullif(sum(total), 0), 1)
      from public.quiz_attempts
      where completed_at >= now() - interval '30 days'
    ), 0),
    'reminderUsers', (select count(*) from public.reminder_settings where enabled),
    'plusUsers', (
      select count(*) from public.subscription_entitlements
      where plus_is_active and (plus_expires_at is null or plus_expires_at > now())
    ),
    'freeLimitUsers', (
      select count(*) from public.word_addition_usage
      where month_key = to_char(timezone('UTC', now()), 'YYYY-MM') and words_added >= 10
    ),
    'usersWithoutWords', (
      select count(*) from auth.users u
      where not exists (select 1 from public.words w where w.user_id = u.id)
    ),
    'learnersWithoutPractice', (
      select count(*) from auth.users u
      where exists (select 1 from public.words w where w.user_id = u.id)
        and not exists (select 1 from public.quiz_attempts q where q.user_id = u.id)
        and not exists (select 1 from public.card_reviews c where c.user_id = u.id)
    ),
    'quizSeconds30d', coalesce((
      select sum(duration_seconds) from public.quiz_attempts
      where completed_at >= now() - interval '30 days'
    ), 0),
    'cardSeconds30d', coalesce((
      select sum(duration_seconds) from public.card_reviews
      where studied_at >= now() - interval '30 days'
    ), 0),
    'screenTime30d', coalesce((
      select jsonb_object_agg(screen, jsonb_build_object(
        'seconds', total_seconds,
        'sessions', session_count
      ))
      from (
        select screen, sum(duration_seconds)::integer as total_seconds, count(*)::integer as session_count
        from public.screen_time_sessions
        where started_at >= now() - interval '30 days'
        group by screen
      ) screen_time
    ), '{}'::jsonb),
    'questionTypeTime30d', coalesce((
      select jsonb_object_agg(question_mode, jsonb_build_object(
        'seconds', total_seconds,
        'answers', answer_count,
        'accuracy', accuracy
      ))
      from (
        select
          coalesce(answer->>'questionMode', 'other') as question_mode,
          round(sum((answer->>'responseTimeSeconds')::numeric))::integer as total_seconds,
          count(*)::integer as answer_count,
          round(100.0 * avg(case when answer->>'correct' = 'true' then 1 else 0 end), 1) as accuracy
        from public.quiz_attempts qa
        cross join lateral jsonb_array_elements(coalesce(qa.answers, '[]'::jsonb)) answer
        where qa.completed_at >= now() - interval '30 days'
          and jsonb_typeof(answer->'responseTimeSeconds') = 'number'
        group by coalesce(answer->>'questionMode', 'other')
      ) question_time
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.is_my_admin() from public;
grant execute on function public.is_my_admin() to authenticated;

revoke all on function public.record_my_screen_time(text, integer, timestamptz) from public;
grant execute on function public.record_my_screen_time(text, integer, timestamptz) to authenticated;

revoke all on function public.admin_dashboard_metrics() from public, anon, authenticated;
grant execute on function public.admin_dashboard_metrics() to service_role;

notify pgrst, 'reload schema';
