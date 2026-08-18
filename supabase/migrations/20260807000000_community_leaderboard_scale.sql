-- Keep public leaderboard reads bounded as the Connect community grows.
-- The activity summary is calculated only for the requested page, never for
-- every eligible learner before pagination.
create index if not exists community_profiles_visible_leaderboard_idx
  on public.community_profiles (user_id)
  where profile_visible and leaderboard_opt_in and leaderboard_eligible;

create index if not exists quiz_attempts_user_id_quiz_date_idx
  on public.quiz_attempts (user_id, quiz_date);

create index if not exists card_reviews_user_id_review_date_idx
  on public.card_reviews (user_id, review_date);

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
      coalesce(t.xp, 0) as xp,
      row_number() over (
        order by coalesce(t.xp, 0) desc, coalesce(t.first_earned, p.created_at) asc, p.public_id asc
      ) as rank,
      count(*) over() as total_users
    from public.community_profiles p
    left join period_totals t on t.user_id = p.user_id
    where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
  ),
  ranked as (
    select *, public.community_leaderboard_level(rank, total_users) as level
    from ranked_base
  ),
  filtered as (
    select * from ranked where p_level is null or level = p_level
  ),
  page as (
    select * from filtered
    order by rank
    limit least(greatest(p_limit, 1), 50)
    offset greatest(p_offset, 0)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', page.rank,
        'publicId', page.public_id,
        'displayName', page.display_name,
        'avatarPath', page.avatar_path,
        'wordCount', (stats.public_stats->>'wordCount')::bigint,
        'achievementsUnlocked', (stats.public_stats->>'achievementsUnlocked')::integer,
        'quizCount', (stats.public_stats->>'quizCount')::bigint,
        'flashcardReviewCount', (stats.public_stats->>'flashcardReviewCount')::bigint,
        'activeStudyDays30d', (stats.public_stats->>'activeStudyDays30d')::bigint,
        'xp', page.xp,
        'level', page.level,
        'isMe', page.user_id = auth.uid()
      ) order by page.rank
    ),
    '[]'::jsonb
  )
  from page
  cross join lateral (
    select public.community_public_activity_stats(page.user_id) as public_stats
  ) stats;
$$;

revoke all on function public.community_leaderboard(text, integer, integer, text) from public;
grant execute on function public.community_leaderboard(text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
