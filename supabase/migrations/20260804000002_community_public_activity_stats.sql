-- Expose a small set of aggregate learning stats for public Connect profiles.
-- No words, answers, timestamps, or private learning records are returned.
create or replace function public.community_public_activity_stats(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with word_stats as (
    select
      count(*)::bigint as word_count,
      count(*) filter (where mastery_percent >= 80)::bigint as strong_words,
      count(*) filter (where mastery_percent >= 100)::bigint as mastered_words,
      coalesce(round(avg(mastery_percent)), 0)::bigint as average_mastery,
      coalesce(max(reviews), 0)::bigint as top_word_reviews
    from (
      select
        reviews,
        case
          when mastery_data->>'masteryPercent' ~ '^[0-9]+([.][0-9]+)?$'
            then greatest(0, least(100, (mastery_data->>'masteryPercent')::numeric))
          else 0
        end as mastery_percent
      from public.words
      where user_id = p_user_id
    ) words
  ),
  quiz_stats as (
    select
      count(*)::bigint as quiz_count,
      coalesce(sum(greatest(total, 0)), 0)::bigint as quiz_questions,
      count(*) filter (where total > 0 and score = total)::bigint as perfect_quizzes
    from public.quiz_attempts
    where user_id = p_user_id
  ),
  quiz_ordered as (
    select
      id,
      completed_at,
      total > 0 and score = total as is_perfect,
      row_number() over (order by completed_at, id) as sequence_number,
      row_number() over (partition by (total > 0 and score = total) order by completed_at, id) as same_status_number
    from public.quiz_attempts
    where user_id = p_user_id
  ),
  perfect_streak as (
    select coalesce(max(run_length), 0)::bigint as longest_perfect_quiz_streak
    from (
      select count(*)::bigint as run_length
      from quiz_ordered
      where is_perfect
      group by sequence_number - same_status_number
    ) runs
  ),
  quiz_day_stats as (
    select coalesce(max(day_count), 0)::bigint as most_quizzes_in_one_day
    from (
      select quiz_date, count(*)::bigint as day_count
      from public.quiz_attempts
      where user_id = p_user_id
      group by quiz_date
    ) days
  ),
  card_stats as (
    select
      count(*)::bigint as card_review_count,
      count(*) filter (where remembered)::bigint as remembered_cards
    from public.card_reviews
    where user_id = p_user_id
  ),
  active_dates as (
    select quiz_date::date as activity_date
    from public.quiz_attempts
    where user_id = p_user_id
    union
    select review_date::date as activity_date
    from public.card_reviews
    where user_id = p_user_id
  ),
  streak_dates as (
    select
      activity_date,
      activity_date - row_number() over (order by activity_date)::integer as streak_group
    from active_dates
  ),
  streak_stats as (
    select coalesce(max(streak_length), 0)::bigint as longest_streak
    from (
      select streak_group, count(*)::bigint as streak_length
      from streak_dates
      group by streak_group
    ) runs
  ),
  activity_stats as (
    select count(*)::bigint as active_study_days_30d
    from active_dates
    where activity_date >= current_date - 29
  ),
  stats as (
    select
      w.word_count,
      w.strong_words,
      w.mastered_words,
      w.average_mastery,
      w.top_word_reviews,
      q.quiz_count,
      q.quiz_questions,
      q.perfect_quizzes,
      ps.longest_perfect_quiz_streak,
      qd.most_quizzes_in_one_day,
      c.card_review_count,
      c.remembered_cards,
      ss.longest_streak,
      a.active_study_days_30d,
      q.quiz_questions + c.card_review_count as total_reviews
    from word_stats w
    cross join quiz_stats q
    cross join perfect_streak ps
    cross join quiz_day_stats qd
    cross join card_stats c
    cross join streak_stats ss
    cross join activity_stats a
  )
  select jsonb_build_object(
    'wordCount', word_count,
    'achievementsUnlocked',
      (case when word_count >= 1 then 1 else 0 end) +
      (case when word_count >= 3 then 1 else 0 end) +
      (case when word_count >= 10 then 1 else 0 end) +
      (case when word_count >= 25 then 1 else 0 end) +
      (case when word_count >= 50 then 1 else 0 end) +
      (case when word_count >= 100 then 1 else 0 end) +
      (case when quiz_count >= 1 then 1 else 0 end) +
      (case when perfect_quizzes >= 1 then 1 else 0 end) +
      (case when longest_perfect_quiz_streak >= 3 then 1 else 0 end) +
      (case when longest_perfect_quiz_streak >= 5 then 1 else 0 end) +
      (case when total_reviews >= 10 then 1 else 0 end) +
      (case when total_reviews >= 25 then 1 else 0 end) +
      (case when total_reviews >= 50 then 1 else 0 end) +
      (case when total_reviews >= 100 then 1 else 0 end) +
      (case when total_reviews >= 250 then 1 else 0 end) +
      (case when total_reviews >= 500 then 1 else 0 end) +
      (case when top_word_reviews >= 5 then 1 else 0 end) +
      (case when strong_words >= 1 then 1 else 0 end) +
      (case when strong_words >= 5 then 1 else 0 end) +
      (case when strong_words >= 10 then 1 else 0 end) +
      (case when strong_words >= 25 then 1 else 0 end) +
      (case when strong_words >= 50 then 1 else 0 end) +
      (case when longest_streak >= 7 then 1 else 0 end) +
      (case when longest_streak >= 14 then 1 else 0 end) +
      (case when longest_streak >= 30 then 1 else 0 end) +
      (case when longest_streak >= 60 then 1 else 0 end) +
      (case when remembered_cards >= 10 then 1 else 0 end) +
      (case when remembered_cards >= 100 then 1 else 0 end) +
      (case when most_quizzes_in_one_day >= 3 then 1 else 0 end) +
      (case when most_quizzes_in_one_day >= 5 then 1 else 0 end) +
      (case when quiz_count >= 3 then 1 else 0 end) +
      (case when quiz_count >= 10 then 1 else 0 end) +
      (case when quiz_count >= 25 then 1 else 0 end) +
      (case when quiz_count >= 50 then 1 else 0 end) +
      (case when perfect_quizzes >= 5 then 1 else 0 end) +
      (case when average_mastery >= 25 then 1 else 0 end) +
      (case when average_mastery >= 50 then 1 else 0 end) +
      (case when average_mastery >= 75 then 1 else 0 end) +
      (case when word_count > 0 and mastered_words = word_count then 1 else 0 end),
    'quizCount', quiz_count,
    'flashcardReviewCount', card_review_count,
    'activeStudyDays30d', active_study_days_30d
  )
  from stats;
$$;

create or replace function public.community_leaderboard(
  p_period text default 'weekly',
  p_limit integer default 20,
  p_offset integer default 0,
  p_level text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select case p_period
      when 'daily' then date_trunc('day', timezone('UTC', now()))
      when 'weekly' then date_trunc('week', timezone('UTC', now()))
      when 'all_time' then null
      else null
    end as since_at
  ),
  period_totals as (
    select l.user_id, sum(l.xp_amount)::bigint as xp, min(l.occurred_at) as first_earned
    from public.community_xp_ledger l cross join bounds b
    where p_period in ('daily', 'weekly', 'all_time')
      and (p_period = 'all_time' or (l.period_eligible and l.occurred_at >= b.since_at))
    group by l.user_id
  ),
  ranked_base as (
    select
      p.user_id,
      p.public_id,
      p.display_name,
      p.avatar_path,
      ps.public_stats->>'wordCount' as word_count,
      ps.public_stats->>'achievementsUnlocked' as achievements_unlocked,
      ps.public_stats->>'quizCount' as quiz_count,
      ps.public_stats->>'flashcardReviewCount' as flashcard_review_count,
      ps.public_stats->>'activeStudyDays30d' as active_study_days_30d,
      coalesce(t.xp, 0) as xp,
      row_number() over (
        order by coalesce(t.xp, 0) desc, coalesce(t.first_earned, p.created_at) asc, p.public_id asc
      ) as rank,
      count(*) over() as total_users
    from public.community_profiles p
    left join period_totals t on t.user_id = p.user_id
    cross join lateral (select public.community_public_activity_stats(p.user_id) as public_stats) ps
    where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
  ),
  ranked as (
    select *, public.community_leaderboard_level(rank, total_users) as level
    from ranked_base
  ),
  filtered as (
    select * from ranked where p_level is null or level = p_level
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'rank', rank,
      'publicId', public_id,
      'displayName', display_name,
      'avatarPath', avatar_path,
      'wordCount', word_count::bigint,
      'achievementsUnlocked', achievements_unlocked::integer,
      'quizCount', quiz_count::bigint,
      'flashcardReviewCount', flashcard_review_count::bigint,
      'activeStudyDays30d', active_study_days_30d::bigint,
      'xp', xp,
      'level', level,
      'isMe', user_id = auth.uid()
    ) order by rank),
    '[]'::jsonb
  )
  from (
    select * from filtered
    order by rank
    limit least(greatest(p_limit, 1), 50)
    offset greatest(p_offset, 0)
  ) page;
$$;

revoke all on function public.community_public_activity_stats(uuid) from public, anon, authenticated;
revoke all on function public.community_leaderboard(text, integer, integer, text) from public;
grant execute on function public.community_leaderboard(text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
