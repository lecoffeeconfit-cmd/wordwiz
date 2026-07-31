-- Connect levels describe leaderboard placement, not raw XP. The leading ten
-- people are Grandmasters; the next forty are Masters; remaining ranks flow
-- through broad percentage bands so there is always room for new Novices.
create or replace function public.community_leaderboard_level(p_rank bigint, p_total bigint)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_cutoff bigint;
  v_remaining bigint;
begin
  if p_rank is null or p_total is null or p_total < 1 then return 'Novice'; end if;

  v_cutoff := least(10, p_total);
  if p_rank <= v_cutoff then return 'Grandmaster'; end if;

  v_cutoff := least(50, p_total);
  if p_rank <= v_cutoff then return 'Master'; end if;

  v_remaining := p_total - v_cutoff;
  v_cutoff := v_cutoff + ceil(v_remaining * 0.20)::bigint;
  if p_rank <= v_cutoff then return 'Mage'; end if;

  v_cutoff := v_cutoff + ceil(v_remaining * 0.25)::bigint;
  if p_rank <= v_cutoff then return 'Adept'; end if;

  v_cutoff := v_cutoff + ceil(v_remaining * 0.25)::bigint;
  if p_rank <= v_cutoff then return 'Journeyman'; end if;

  v_cutoff := v_cutoff + ceil(v_remaining * 0.20)::bigint;
  if p_rank <= v_cutoff then return 'Apprentice'; end if;
  return 'Novice';
end;
$$;

create or replace function public.community_leaderboard(p_period text default 'weekly', p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
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
  ranked as (
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
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', rank,
        'publicId', public_id,
        'displayName', display_name,
        'avatarPath', avatar_path,
        'xp', xp,
        'level', public.community_leaderboard_level(rank, total_users),
        'isMe', user_id = auth.uid()
      ) order by rank
    ),
    '[]'::jsonb
  )
  from (
    select * from ranked
    order by rank
    limit least(greatest(p_limit, 1), 50)
    offset greatest(p_offset, 0)
  ) page;
$$;

create or replace function public.community_my_context(p_period text default 'weekly')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_profile public.community_profiles%rowtype;
  v_xp bigint := 0;
  v_all_time_xp bigint := 0;
  v_rank bigint;
  v_total_users bigint := 0;
  v_unread bigint := 0;
  v_requests bigint := 0;
  v_since timestamptz;
  v_tiers jsonb := '[]'::jsonb;
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into v_profile from public.community_profiles where user_id = v_me;
  if p_period = 'daily' then v_since := date_trunc('day', timezone('UTC', now()));
  elsif p_period = 'weekly' then v_since := date_trunc('week', timezone('UTC', now()));
  elsif p_period = 'all_time' then v_since := null;
  else raise exception 'invalid_period' using errcode = '22023'; end if;

  select coalesce(sum(xp_amount), 0) into v_xp
  from public.community_xp_ledger
  where user_id = v_me
    and (p_period = 'all_time' or (period_eligible and occurred_at >= v_since));
  select coalesce(sum(xp_amount), 0) into v_all_time_xp
  from public.community_xp_ledger where user_id = v_me;

  if coalesce(v_profile.leaderboard_opt_in, false) and coalesce(v_profile.leaderboard_eligible, false) then
    select rank, total_users into v_rank, v_total_users from (
      select
        p.user_id,
        row_number() over (
          order by coalesce(sum(l.xp_amount), 0) desc, coalesce(min(l.occurred_at), p.created_at) asc, p.public_id asc
        ) as rank,
        count(*) over() as total_users
      from public.community_profiles p
      left join public.community_xp_ledger l on l.user_id = p.user_id
        and (p_period = 'all_time' or (l.period_eligible and l.occurred_at >= v_since))
      where p.leaderboard_opt_in and p.leaderboard_eligible
      group by p.user_id, p.created_at, p.public_id
    ) ranked where user_id = v_me;
  end if;

  with ranked as (
    select
      p.user_id,
      row_number() over (
        order by coalesce(sum(l.xp_amount), 0) desc, coalesce(min(l.occurred_at), p.created_at) asc, p.public_id asc
      ) as rank,
      count(*) over() as total_users
    from public.community_profiles p
    left join public.community_xp_ledger l on l.user_id = p.user_id
      and (p_period = 'all_time' or (l.period_eligible and l.occurred_at >= v_since))
    where p.leaderboard_opt_in and p.leaderboard_eligible
    group by p.user_id, p.created_at, p.public_id
  ),
  level_names(level, position) as (
    values
      ('Novice'::text, 1), ('Apprentice', 2), ('Journeyman', 3), ('Adept', 4),
      ('Mage', 5), ('Master', 6), ('Grandmaster', 7)
  ),
  counts as (
    select public.community_leaderboard_level(rank, total_users) as level, count(*)::bigint as count
    from ranked group by public.community_leaderboard_level(rank, total_users)
  ),
  total as (select count(*)::bigint as count from ranked)
  select coalesce(jsonb_agg(jsonb_build_object(
    'level', n.level,
    'count', coalesce(c.count, 0),
    'percentage', case when t.count = 0 then 0 else round(coalesce(c.count, 0)::numeric * 100 / t.count)::integer end
  ) order by n.position), '[]'::jsonb)
  into v_tiers
  from level_names n
  left join counts c on c.level = n.level
  cross join total t;

  select count(*) into v_unread from public.community_nudges where recipient_id = v_me and read_at is null;
  select count(*) into v_requests from public.community_friendships where recipient_id = v_me and status = 'pending';
  return jsonb_build_object(
    'enabled', (select enabled from public.community_settings where id),
    'profile', case when v_profile.user_id is null then null else jsonb_build_object(
      'displayName', v_profile.display_name,
      'friendCode', v_profile.friend_code,
      'avatarPath', v_profile.avatar_path,
      'leaderboardOptIn', v_profile.leaderboard_opt_in,
      'friendRequestsEnabled', v_profile.friend_requests_enabled,
      'nudgesEnabled', v_profile.nudges_enabled,
      'pushNudgesEnabled', v_profile.push_nudges_enabled
    ) end,
    'xp', v_xp,
    'allTimeXp', v_all_time_xp,
    'rank', v_rank,
    'level', public.community_leaderboard_level(v_rank, v_total_users),
    'tierSummary', v_tiers,
    'unreadNudges', v_unread,
    'incomingRequests', v_requests
  );
end;
$$;

revoke all on function public.community_leaderboard_level(bigint, bigint), public.community_leaderboard(text, integer, integer), public.community_my_context(text) from public;
grant execute on function public.community_leaderboard_level(bigint, bigint), public.community_leaderboard(text, integer, integer), public.community_my_context(text) to authenticated;
notify pgrst, 'reload schema';
