-- Add the Connect profile join month to public competitive cards. The month
-- is profile metadata, not account identity or private learning activity.

create or replace function public.community_competitive_metric_leaderboard(
  p_metric text default 'collectors',
  p_period text default 'all_time',
  p_scope text default 'global',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_area_key text;
  v_state_key text;
  v_country_key text;
begin
  if v_me is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_metric not in ('collectors', 'retention', 'streaks')
    or p_period not in ('week', 'month', 'all_time')
    or p_scope not in ('all', 'nearby', 'state', 'global') then
    raise exception 'invalid_competitive_metric' using errcode = '22023';
  end if;

  select area_key, state_key, country_key
  into v_area_key, v_state_key, v_country_key
  from public.word_collector_regions
  where user_id = v_me;

  if (p_scope = 'all' and v_country_key is null)
    or (p_scope = 'nearby' and v_area_key is null)
    or (p_scope = 'state' and v_state_key is null) then
    raise exception 'collector_location_required' using errcode = 'P0001';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank', r.rank,
      'publicId', r.public_id,
      'displayName', r.display_name,
      'avatarPath', r.avatar_path,
      'joinedAt', p.created_at,
      'wordCount', r.word_count,
      'metricValue', r.metric_value,
      'reviewCount', r.review_count,
      'retentionPercent', r.retention_percent,
      'retentionScore', r.retention_score,
      'streakDays', r.streak_days,
      'isMe', r.user_id = v_me
    ) order by r.rank), '[]'::jsonb)
    from (
      select *
      from public.community_competitive_metric_rows(p_metric, p_period, p_scope, v_me)
      order by rank
      limit least(greatest(p_limit, 1), 50)
      offset greatest(p_offset, 0)
    ) r
    join public.community_profiles p on p.user_id = r.user_id
  );
end;
$$;

create or replace function public.community_competitive_metric_my_rank(
  p_metric text default 'collectors',
  p_period text default 'all_time',
  p_scope text default 'global',
  p_radius integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_rank bigint;
begin
  if v_me is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select rank into v_rank
  from public.community_competitive_metric_rows(p_metric, p_period, p_scope, v_me)
  where user_id = v_me;

  if v_rank is null then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'rank', r.rank,
      'publicId', r.public_id,
      'displayName', r.display_name,
      'avatarPath', r.avatar_path,
      'joinedAt', p.created_at,
      'wordCount', r.word_count,
      'metricValue', r.metric_value,
      'reviewCount', r.review_count,
      'retentionPercent', r.retention_percent,
      'retentionScore', r.retention_score,
      'streakDays', r.streak_days,
      'isMe', r.user_id = v_me
    ) order by r.rank), '[]'::jsonb)
    from public.community_competitive_metric_rows(p_metric, p_period, p_scope, v_me) r
    join public.community_profiles p on p.user_id = r.user_id
    where r.rank between greatest(1, v_rank - least(greatest(p_radius, 1), 5))
      and v_rank + least(greatest(p_radius, 1), 5)
  );
end;
$$;

notify pgrst, 'reload schema';
