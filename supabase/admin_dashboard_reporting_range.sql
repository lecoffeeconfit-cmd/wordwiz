-- Adds Today / 7 days / 30 days / All time support to Admin Center metrics.
-- Lifetime-only totals (for example, total users and saved words) stay stable.

create or replace function public.admin_dashboard_metrics(p_range text default '30d')
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
  with range_window as (
    select
      case p_range
        when 'today' then date_trunc('day', timezone('UTC', now()))
        when '7d' then now() - interval '7 days'
        when 'all' then null
        else now() - interval '30 days'
      end as starts_at,
      p_range = 'all' as is_all_time
  )
  select jsonb_build_object(
    'totalUsers', (select count(*) from auth.users),
    'newUsers7d', (
      select count(*) from auth.users cross join range_window rw
      where rw.is_all_time or created_at >= rw.starts_at
    ),
    'activeUsers7d', (
      select count(distinct user_id)
      from (
        select user_id, completed_at as activity_at from public.quiz_attempts
        union
        select user_id, studied_at as activity_at from public.card_reviews
        union
        select user_id, updated_at as activity_at from public.words
      ) active_users
      cross join range_window rw
      where rw.is_all_time or activity_at >= rw.starts_at
    ),
    'savedWords', (select count(*) from public.words),
    'quizAttempts7d', (
      select count(*) from public.quiz_attempts cross join range_window rw
      where rw.is_all_time or completed_at >= rw.starts_at
    ),
    'cardReviews7d', (
      select count(*) from public.card_reviews cross join range_window rw
      where rw.is_all_time or studied_at >= rw.starts_at
    ),
    'quizAccuracy30d', coalesce((
      select round(100.0 * sum(score)::numeric / nullif(sum(total), 0), 1)
      from public.quiz_attempts cross join range_window rw
      where rw.is_all_time or completed_at >= rw.starts_at
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
      select sum(duration_seconds) from public.quiz_attempts cross join range_window rw
      where rw.is_all_time or completed_at >= rw.starts_at
    ), 0),
    'cardSeconds30d', coalesce((
      select sum(duration_seconds) from public.card_reviews cross join range_window rw
      where rw.is_all_time or studied_at >= rw.starts_at
    ), 0),
    'screenTime30d', coalesce((
      select jsonb_object_agg(screen, jsonb_build_object(
        'seconds', total_seconds,
        'sessions', session_count
      ))
      from (
        select screen, sum(duration_seconds)::integer as total_seconds, count(*)::integer as session_count
        from public.screen_time_sessions cross join range_window rw
        where rw.is_all_time or started_at >= rw.starts_at
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
        cross join range_window rw
        where jsonb_typeof(answer->'responseTimeSeconds') = 'number'
          and (rw.is_all_time or qa.completed_at >= rw.starts_at)
        group by coalesce(answer->>'questionMode', 'other')
      ) question_time
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.admin_dashboard_metrics(text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_metrics(text) to service_role;

notify pgrst, 'reload schema';
