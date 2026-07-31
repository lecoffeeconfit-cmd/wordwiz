-- Allow the Connect leaderboard to show one rank level at a time while
-- retaining global rank numbers and the global level calculation.
drop function if exists public.community_leaderboard(text, integer, integer);

create function public.community_leaderboard(
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
    where p.leaderboard_opt_in and p.leaderboard_eligible
  ),
  ranked as (
    select *, public.community_leaderboard_level(rank, total_users) as level
    from ranked_base
  ),
  filtered as (
    select *
    from ranked
    where p_level is null or level = p_level
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', rank,
        'publicId', public_id,
        'displayName', display_name,
        'avatarPath', avatar_path,
        'xp', xp,
        'level', level,
        'isMe', user_id = auth.uid()
      ) order by rank
    ),
    '[]'::jsonb
  )
  from (
    select *
    from filtered
    order by rank
    limit least(greatest(p_limit, 1), 50)
    offset greatest(p_offset, 0)
  ) page;
$$;

revoke all on function public.community_leaderboard(text, integer, integer, text) from public;
grant execute on function public.community_leaderboard(text, integer, integer, text) to authenticated;

notify pgrst, 'reload schema';
