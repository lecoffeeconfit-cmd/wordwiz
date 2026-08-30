-- Fix the deployed retention breakdown helper. The original version unions the
-- ranked target public_id (text) with the profile public_id (uuid), which
-- makes the RPC fail before it can return any activity counts.

create or replace function public.community_competitive_metric_review_breakdown(
  p_metric text default 'retention',
  p_period text default 'all_time',
  p_scope text default 'global',
  p_limit integer default 20,
  p_offset integer default 0,
  p_only_me boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_metric not in ('collectors', 'retention', 'streaks')
    or p_period not in ('week', 'month', 'all_time')
    or p_scope not in ('all', 'nearby', 'state', 'global') then
    raise exception 'invalid_competitive_metric' using errcode = '22023';
  end if;

  if p_metric <> 'retention' then
    return '[]'::jsonb;
  end if;

  return (
    with bounds as (
      select case p_period
        when 'week' then date_trunc('week', timezone('UTC', now()))::date
        when 'month' then date_trunc('month', timezone('UTC', now()))::date
        else null::date
      end as since_date
    ),
    ranked_targets as (
      select r.user_id, r.public_id, r.rank
      from public.community_competitive_metric_rows(p_metric, p_period, p_scope, v_me) r
      where not p_only_me or r.user_id = v_me
      order by r.rank
      limit least(greatest(case when p_only_me then 1 else coalesce(p_limit, 20) end, 1), 50)
      offset case when p_only_me then 0 else greatest(coalesce(p_offset, 0), 0) end
    ),
    own_target as (
      select p.user_id, p.public_id::text as public_id, null::bigint as rank
      from public.community_profiles p
      where p_only_me
        and p.user_id = v_me
        and not exists (select 1 from ranked_targets)
    ),
    targets as (
      select * from ranked_targets
      union all
      select * from own_target
    ),
    review_events as (
      select
        c.user_id,
        c.review_date::date as review_date,
        'card'::text as review_kind
      from public.card_reviews c
      join targets t on t.user_id = c.user_id

      union all

      select
        q.user_id,
        q.quiz_date::date as review_date,
        case
          when answer.value ? 'gameType' then 'game'
          when answer.value ->> 'sessionMode' in ('mastery-test', 'omega-test') then 'test'
          else 'quiz'
        end as review_kind
      from public.quiz_attempts q
      join targets t on t.user_id = q.user_id
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where (answer.value ->> 'correct') in ('true', 'false')
        and not exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
          ) incomplete_answer
          where incomplete_answer.value ->> 'attemptStatus' = 'incomplete'
        )
    ),
    breakdowns as (
      select
        e.user_id,
        count(*)::bigint as review_count,
        count(*) filter (where e.review_kind = 'card')::bigint as flashcard_review_count,
        count(*) filter (where e.review_kind = 'quiz')::bigint as quiz_answer_count,
        count(*) filter (where e.review_kind = 'test')::bigint as test_answer_count,
        count(*) filter (where e.review_kind = 'game')::bigint as game_answer_count
      from review_events e
      cross join bounds b
      where p_period = 'all_time' or e.review_date >= b.since_date
      group by e.user_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'publicId', t.public_id,
      'reviewCount', coalesce(b.review_count, 0),
      'flashcardReviewCount', coalesce(b.flashcard_review_count, 0),
      'quizAnswerCount', coalesce(b.quiz_answer_count, 0),
      'testAnswerCount', coalesce(b.test_answer_count, 0),
      'gameAnswerCount', coalesce(b.game_answer_count, 0)
    ) order by t.rank nulls last, t.public_id), '[]'::jsonb)
    from targets t
    left join breakdowns b on b.user_id = t.user_id
  );
end;
$$;

revoke all on function public.community_competitive_metric_review_breakdown(text, text, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.community_competitive_metric_review_breakdown(text, text, text, integer, integer, boolean) to authenticated;

notify pgrst, 'reload schema';
