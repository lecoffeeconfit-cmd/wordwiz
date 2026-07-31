-- Social levels are based on lifetime Social XP, so every Connect profile has
-- a stable level regardless of its current leaderboard position or privacy setting.
create or replace function public.community_social_level(p_xp bigint)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(p_xp, 0) >= 6000 then 'Grandmaster'
    when coalesce(p_xp, 0) >= 3000 then 'Master'
    when coalesce(p_xp, 0) >= 1500 then 'Mage'
    when coalesce(p_xp, 0) >= 750 then 'Adept'
    when coalesce(p_xp, 0) >= 300 then 'Journeyman'
    when coalesce(p_xp, 0) >= 100 then 'Apprentice'
    else 'Novice'
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
  lifetime_totals as (
    select user_id, sum(xp_amount)::bigint as xp
    from public.community_xp_ledger
    group by user_id
  ),
  ranked as (
    select
      p.user_id,
      p.public_id,
      p.display_name,
      p.avatar_path,
      coalesce(pt.xp, 0) as xp,
      public.community_social_level(coalesce(lt.xp, 0)) as level,
      row_number() over (
        order by coalesce(pt.xp, 0) desc, coalesce(pt.first_earned, p.created_at) asc, p.public_id asc
      ) as rank
    from public.community_profiles p
    left join period_totals pt on pt.user_id = p.user_id
    left join lifetime_totals lt on lt.user_id = p.user_id
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
        'level', level,
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
  from public.community_xp_ledger
  where user_id = v_me;

  if coalesce(v_profile.leaderboard_opt_in, false) and coalesce(v_profile.leaderboard_eligible, false) then
    select rank into v_rank from (
      select
        p.user_id,
        row_number() over (
          order by coalesce(sum(l.xp_amount) filter (where p_period = 'all_time' or (l.period_eligible and l.occurred_at >= v_since)), 0) desc,
          p.created_at asc,
          p.public_id asc
        ) as rank
      from public.community_profiles p
      left join public.community_xp_ledger l on l.user_id = p.user_id
      where p.leaderboard_opt_in and p.leaderboard_eligible
      group by p.user_id, p.created_at, p.public_id
    ) ranked where user_id = v_me;
  end if;

  with level_names(level, position) as (
    values
      ('Novice'::text, 1), ('Apprentice', 2), ('Journeyman', 3), ('Adept', 4),
      ('Mage', 5), ('Master', 6), ('Grandmaster', 7)
  ),
  profile_totals as (
    select p.user_id, public.community_social_level(coalesce(sum(l.xp_amount), 0)) as level
    from public.community_profiles p
    left join public.community_xp_ledger l on l.user_id = p.user_id
    group by p.user_id
  ),
  counts as (
    select level, count(*)::bigint as count from profile_totals group by level
  ),
  total as (select count(*)::bigint as count from profile_totals)
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
    'level', public.community_social_level(v_all_time_xp),
    'tierSummary', v_tiers,
    'unreadNudges', v_unread,
    'incomingRequests', v_requests
  );
end;
$$;

revoke all on function public.community_social_level(bigint), public.community_leaderboard(text, integer, integer), public.community_my_context(text) from public;
grant execute on function public.community_social_level(bigint), public.community_leaderboard(text, integer, integer), public.community_my_context(text) to authenticated;
notify pgrst, 'reload schema';
