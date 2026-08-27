-- Competitive learning metrics stay aggregate-only. Public rows contain a
-- display name and a metric value; review events, words, and location keys
-- never leave these security-definer functions.

alter table public.word_collector_regions
  add column if not exists country_key text;

alter table public.word_collector_regions
  drop constraint if exists word_collector_regions_country_key_check;

alter table public.word_collector_regions
  add constraint word_collector_regions_country_key_check
  check (country_key is null or country_key ~ '^[a-z0-9_-]{2,32}$');

create index if not exists word_collector_regions_country_idx
  on public.word_collector_regions (country_key, user_id)
  where country_key is not null;

create or replace function public.word_collectors_set_my_location(
  p_area_key text,
  p_state_key text,
  p_country_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_area_key text := lower(trim(p_area_key));
  v_state_key text := nullif(lower(trim(coalesce(p_state_key, ''))), '');
  v_country_key text := nullif(lower(trim(coalesce(p_country_key, ''))), '');
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if v_area_key !~ '^[a-z0-9_-]{3,64}$'
    or (v_state_key is not null and v_state_key !~ '^[a-z0-9_-]{3,96}$')
    or (v_country_key is not null and v_country_key !~ '^[a-z0-9_-]{2,32}$') then
    raise exception 'invalid_collector_region' using errcode = '22023';
  end if;

  insert into public.word_collector_regions (user_id, area_key, state_key, country_key, updated_at)
  values (v_user_id, v_area_key, v_state_key, v_country_key, now())
  on conflict (user_id) do update
  set area_key = excluded.area_key,
      state_key = excluded.state_key,
      country_key = excluded.country_key,
      updated_at = excluded.updated_at;
end;
$$;

-- Keep older clients working; new clients send the country key as well.
create or replace function public.word_collectors_set_my_location(
  p_area_key text,
  p_state_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.word_collectors_set_my_location(p_area_key, p_state_key, null);
end;
$$;

create or replace function public.community_competitive_metric_rows(
  p_metric text,
  p_period text,
  p_scope text,
  p_me uuid
)
returns table (
  metric text,
  user_id uuid,
  public_id text,
  display_name text,
  avatar_path text,
  word_count bigint,
  review_count bigint,
  retention_percent bigint,
  retention_score numeric,
  streak_days bigint,
  metric_value numeric,
  first_activity timestamptz,
  rank bigint,
  total_users bigint
)
language sql
stable
security definer
set search_path = public
as $$
with bounds as (
  select case p_period
    when 'week' then date_trunc('week', timezone('UTC', now()))::date
    when 'month' then date_trunc('month', timezone('UTC', now()))::date
    else null::date
  end as since_date
),
my_region as (
  select area_key, state_key, country_key
  from public.word_collector_regions
  where user_id = p_me
  union all
  select null::text, null::text, null::text
  where not exists (
    select 1 from public.word_collector_regions where user_id = p_me
  )
),
collector_totals as (
  select
    e.user_id,
    count(*)::bigint as word_count,
    min(e.first_added_at) as first_activity
  from public.word_collector_entries e
  cross join bounds b
  where p_period = 'all_time' or e.first_added_at::date >= b.since_date
  group by e.user_id
),
review_events as (
  select
    c.user_id,
    c.review_date::date as review_date,
    c.remembered,
    c.studied_at as occurred_at
  from public.card_reviews c
  union all
  select
    q.user_id,
    q.quiz_date::date as review_date,
    (case when (answer.value ->> 'correct') in ('true', 'false') then answer.value ->> 'correct' end)::boolean as remembered,
    q.completed_at as occurred_at
  from public.quiz_attempts q
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
  ) answer
  where (answer.value ->> 'correct') in ('true', 'false')
),
review_totals as (
  select
    e.user_id,
    count(*)::bigint as review_count,
    count(*) filter (where e.remembered)::bigint as remembered_count,
    min(e.occurred_at) as first_activity
  from review_events e
  cross join bounds b
  where p_period = 'all_time' or e.review_date >= b.since_date
  group by e.user_id
),
active_dates as (
  select q.user_id, q.quiz_date::date as activity_date
  from public.quiz_attempts q
  union
  select c.user_id, c.review_date::date as activity_date
  from public.card_reviews c
),
numbered_dates as (
  select
    d.user_id,
    d.activity_date,
    d.activity_date - row_number() over (
      partition by d.user_id order by d.activity_date
    )::integer as streak_group
  from active_dates d
),
streak_runs as (
  select
    user_id,
    streak_group,
    count(*)::bigint as run_length,
    min(activity_date) as run_start,
    max(activity_date) as run_end
  from numbered_dates
  group by user_id, streak_group
),
latest_activity as (
  select user_id, max(activity_date) as latest_date
  from active_dates
  group by user_id
),
current_streaks as (
  select r.user_id, r.run_length as streak_days
  from streak_runs r
  join latest_activity l on l.user_id = r.user_id and l.latest_date = r.run_end
  where l.latest_date >= current_date - 1
),
metric_rows as (
  select
    'collectors'::text as metric,
    c.user_id,
    c.word_count,
    null::bigint as review_count,
    null::bigint as retention_percent,
    null::numeric as retention_score,
    null::bigint as streak_days,
    c.word_count::numeric as metric_value,
    c.first_activity
  from collector_totals c
  where p_metric = 'collectors'

  union all

  select
    'retention'::text,
    r.user_id,
    0::bigint,
    r.review_count,
    round((r.remembered_count::numeric / greatest(r.review_count, 1)) * 100)::bigint,
    round(
      ((r.remembered_count::numeric / greatest(r.review_count, 1)) * 100)
      * (0.7 + 0.3 * least(1, sqrt(r.review_count::numeric / 250)))
    ),
    null::bigint,
    (
      ((r.remembered_count::numeric / greatest(r.review_count, 1)) * 100)
      * (0.7 + 0.3 * least(1, sqrt(r.review_count::numeric / 250)))
    ),
    r.first_activity
  from review_totals r
  where p_metric = 'retention' and r.review_count >= 40

  union all

  select
    'streaks'::text,
    s.user_id,
    0::bigint,
    null::bigint,
    null::bigint,
    null::numeric,
    s.streak_days,
    s.streak_days::numeric,
    null::timestamptz
  from current_streaks s
  where p_metric = 'streaks'
),
scoped_rows as (
  select m.*
  from metric_rows m
  cross join my_region mine
  left join public.word_collector_regions member_region on member_region.user_id = m.user_id
  where
    p_scope = 'global'
    or (p_scope = 'all' and mine.country_key is not null and member_region.country_key = mine.country_key)
    or (p_scope = 'state' and mine.state_key is not null and member_region.state_key = mine.state_key)
    or (p_scope = 'nearby' and mine.area_key is not null and member_region.area_key = mine.area_key)
),
ranked_rows as (
  select
    s.*,
    p.public_id,
    p.display_name,
    p.avatar_path,
    row_number() over (
      order by s.metric_value desc, s.review_count desc nulls last, s.first_activity asc nulls last, p.public_id asc
    ) as computed_rank,
    count(*) over () as computed_total_users
  from scoped_rows s
  join public.community_profiles p on p.user_id = s.user_id
  where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
)
select
  r.metric,
  r.user_id,
  r.public_id,
  r.display_name,
  r.avatar_path,
  r.word_count,
  r.review_count,
  r.retention_percent,
  r.retention_score,
  r.streak_days,
  r.metric_value,
  r.first_activity,
  r.computed_rank,
  r.computed_total_users
from ranked_rows r;
$$;

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
      'wordCount', r.word_count,
      'metricValue', r.metric_value,
      'reviewCount', r.review_count,
      'retentionPercent', r.retention_percent,
      'retentionScore', r.retention_score,
      'streakDays', r.streak_days,
      'isMe', r.user_id = v_me
    ) order by r.rank), '[]'::jsonb)
    from public.community_competitive_metric_rows(p_metric, p_period, p_scope, v_me) r
    where r.rank between greatest(1, v_rank - least(greatest(p_radius, 1), 5))
      and v_rank + least(greatest(p_radius, 1), 5)
  );
end;
$$;

create or replace function public.community_competitive_metric_context(
  p_metric text default 'collectors',
  p_period text default 'all_time',
  p_scope text default 'global'
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
  v_eligible boolean := false;
  v_has_location boolean := true;
  v_rank bigint;
  v_total_users bigint := 0;
  v_word_count bigint := 0;
  v_review_count bigint := 0;
  v_remembered_count bigint := 0;
  v_retention_percent bigint := 0;
  v_retention_score numeric;
  v_streak_days bigint := 0;
  v_qualified boolean := false;
  v_location_label text := 'Global';
  v_since_date date;
begin
  if v_me is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_metric not in ('collectors', 'retention', 'streaks')
    or p_period not in ('week', 'month', 'all_time')
    or p_scope not in ('all', 'nearby', 'state', 'global') then
    raise exception 'invalid_competitive_metric' using errcode = '22023';
  end if;

  select area_key, state_key, country_key into v_area_key, v_state_key, v_country_key
  from public.word_collector_regions where user_id = v_me;
  select coalesce(profile_visible and leaderboard_opt_in and leaderboard_eligible, false)
  into v_eligible from public.community_profiles where user_id = v_me;

  v_has_location := case p_scope
    when 'all' then v_country_key is not null
    when 'nearby' then v_area_key is not null
    when 'state' then v_state_key is not null
    else true
  end;

  v_since_date := case p_period
    when 'week' then date_trunc('week', timezone('UTC', now()))::date
    when 'month' then date_trunc('month', timezone('UTC', now()))::date
    else null
  end;

  if p_metric = 'collectors' then
    select count(*) into v_word_count
    from public.word_collector_entries
    where user_id = v_me and (p_period = 'all_time' or first_added_at::date >= v_since_date);
    v_qualified := v_word_count > 0;
  elsif p_metric = 'retention' then
    select count(*), count(*) filter (where remembered)
    into v_review_count, v_remembered_count
    from (
      select user_id, review_date::date as review_date, remembered
      from public.card_reviews
      where user_id = v_me
      union all
      select q.user_id, q.quiz_date::date, (case when (answer.value ->> 'correct') in ('true', 'false') then answer.value ->> 'correct' end)::boolean
      from public.quiz_attempts q
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where q.user_id = v_me and (answer.value ->> 'correct') in ('true', 'false')
    ) events
    where p_period = 'all_time' or review_date >= v_since_date;
    v_retention_percent := round((v_remembered_count::numeric / greatest(v_review_count, 1)) * 100)::bigint;
    if v_review_count >= 40 then
      v_retention_score := round(
        v_retention_percent * (0.7 + 0.3 * least(1, sqrt(v_review_count::numeric / 250)))
      );
    end if;
    v_qualified := v_review_count >= 40;
  else
    select coalesce(streak_days, 0) into v_streak_days
    from public.community_competitive_metric_rows('streaks', 'all_time', p_scope, v_me)
    where user_id = v_me;
    v_qualified := v_streak_days > 0;
  end if;

  if p_scope = 'state' and v_state_key is not null then
    v_location_label := initcap(replace(regexp_replace(v_state_key, '^[^-]+-', ''), '-', ' '));
  elsif p_scope = 'all' and v_country_key is not null then
    v_location_label := case when v_country_key = 'us' then 'United States' else initcap(replace(v_country_key, '-', ' ')) end;
  elsif p_scope = 'nearby' then
    v_location_label := 'Nearby';
  end if;

  select r.rank, r.total_users, r.retention_percent, r.retention_score, r.streak_days
  into v_rank, v_total_users, v_retention_percent, v_retention_score, v_streak_days
  from public.community_competitive_metric_rows(p_metric, p_period, p_scope, v_me) r
  where r.user_id = v_me;

  return jsonb_build_object(
    'metric', p_metric,
    'eligible', v_eligible,
    'hasLocation', v_has_location,
    'rank', v_rank,
    'totalUsers', coalesce(v_total_users, 0),
    'wordCount', v_word_count,
    'metricValue', case p_metric when 'collectors' then v_word_count when 'retention' then v_retention_percent else v_streak_days end,
    'reviewCount', v_review_count,
    'retentionPercent', v_retention_percent,
    'retentionScore', v_retention_score,
    'streakDays', v_streak_days,
    'qualified', v_qualified,
    'reviewsToQualify', greatest(0, 40 - v_review_count),
    'locationLabel', v_location_label
  );
end;
$$;

revoke all on function public.word_collectors_set_my_location(text, text, text), public.community_competitive_metric_rows(text, text, text, uuid), public.community_competitive_metric_leaderboard(text, text, text, integer, integer), public.community_competitive_metric_my_rank(text, text, text, integer), public.community_competitive_metric_context(text, text, text) from public, anon, authenticated;
grant execute on function public.word_collectors_set_my_location(text, text, text), public.community_competitive_metric_leaderboard(text, text, text, integer, integer), public.community_competitive_metric_my_rank(text, text, text, integer), public.community_competitive_metric_context(text, text, text) to authenticated;

notify pgrst, 'reload schema';
