-- Admin-only learning activity leaders for the selected reporting range.
-- This deliberately exposes counts only: never saved terms, definitions,
-- answers, device details, API usage, or other learner content.

create or replace function public.admin_dashboard_top_learners(p_range text default '30d')
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
  ),
  activity as (
    select w.user_id, count(*)::integer as words_saved, 0::integer as quizzes, 0::integer as reviews
    from public.words w cross join range_window rw
    where rw.is_all_time or w.created_at >= rw.starts_at
    group by w.user_id

    union all

    select q.user_id, 0::integer, count(*)::integer, 0::integer
    from public.quiz_attempts q cross join range_window rw
    where rw.is_all_time or q.completed_at >= rw.starts_at
    group by q.user_id

    union all

    select c.user_id, 0::integer, 0::integer, count(*)::integer
    from public.card_reviews c cross join range_window rw
    where rw.is_all_time or c.studied_at >= rw.starts_at
    group by c.user_id
  ),
  learner_totals as (
    select
      user_id,
      sum(words_saved)::integer as words_saved,
      sum(quizzes)::integer as quizzes,
      sum(reviews)::integer as reviews,
      sum(words_saved + quizzes + reviews)::integer as learning_actions
    from activity
    group by user_id
    order by learning_actions desc, reviews desc, quizzes desc, words_saved desc
    limit 5
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'userId', learner_totals.user_id,
        'name', coalesce(
          nullif(auth_user.raw_user_meta_data->>'name', ''),
          nullif(auth_user.raw_user_meta_data->>'full_name', '')
        ),
        'email', auth_user.email,
        'wordsSaved', learner_totals.words_saved,
        'quizCount', learner_totals.quizzes,
        'cardReviewCount', learner_totals.reviews,
        'learningActions', learner_totals.learning_actions
      )
      order by learner_totals.learning_actions desc,
        learner_totals.reviews desc,
        learner_totals.quizzes desc,
        learner_totals.words_saved desc
    ),
    '[]'::jsonb
  )
  from learner_totals
  join auth.users auth_user on auth_user.id = learner_totals.user_id;
$$;

revoke all on function public.admin_dashboard_top_learners(text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_top_learners(text) to service_role;

notify pgrst, 'reload schema';
