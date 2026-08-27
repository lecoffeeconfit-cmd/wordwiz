-- Learning Streaks use the same Daily Learning Goal as the app:
-- one completed quiz, game/crossword, or active flashcard review is one
-- activity. Each learner's goal is private and can change beginning on a day.

create table if not exists public.community_daily_learning_goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_date date not null,
  goal_count integer not null check (goal_count between 1 and 50),
  time_zone text not null default 'UTC',
  updated_at timestamptz not null default now(),
  primary key (user_id, effective_date)
);

create index if not exists community_daily_learning_goals_lookup_idx
  on public.community_daily_learning_goals (user_id, effective_date desc);

alter table public.community_daily_learning_goals enable row level security;
revoke all on table public.community_daily_learning_goals from public, anon, authenticated;

create or replace function public.community_set_daily_learning_goal(
  p_goal integer,
  p_effective_date text default null,
  p_time_zone text default 'UTC'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal integer := greatest(1, least(coalesce(p_goal, 1), 50));
  v_time_zone text := coalesce(nullif(trim(p_time_zone), ''), 'UTC');
  v_effective_date date;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_goal is null or p_goal < 1 or p_goal > 50 then
    raise exception 'invalid_daily_learning_goal' using errcode = '22023';
  end if;

  -- Device timezone is used only to decide which local day is current. It is
  -- never shown publicly and an unknown value safely falls back to UTC.
  if not exists (select 1 from pg_timezone_names where name = v_time_zone) then
    v_time_zone := 'UTC';
  end if;

  if nullif(trim(coalesce(p_effective_date, '')), '') is null then
    v_effective_date := timezone(v_time_zone, now())::date;
  else
    begin
      v_effective_date := trim(p_effective_date)::date;
    exception when others then
      raise exception 'invalid_daily_learning_date' using errcode = '22023';
    end;
  end if;

  insert into public.community_daily_learning_goals (
    user_id, effective_date, goal_count, time_zone, updated_at
  )
  values (v_user_id, v_effective_date, v_goal, v_time_zone, now())
  on conflict (user_id, effective_date) do update
  set goal_count = excluded.goal_count,
      time_zone = excluded.time_zone,
      updated_at = excluded.updated_at;
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
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) incomplete_answer
      where incomplete_answer.value ->> 'attemptStatus' = 'incomplete'
    )
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
learning_activities as (
  -- A regular quiz is one activity, regardless of question count or score.
  select
    q.user_id,
    q.quiz_date::date as activity_date,
    q.completed_at as occurred_at,
    ('quiz:' || q.id::text) as activity_id
  from public.quiz_attempts q
  where not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where answer ? 'gameType'
    )
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where answer ->> 'attemptStatus' = 'incomplete'
    )
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where coalesce(answer ->> 'wordId', '') <> ''
        and left(answer ->> 'wordId', 2) <> '__'
    )

  union all

  -- Games are stored in quiz_attempts too, but one game attempt is one
  -- activity. This includes the weekly crossword.
  select
    q.user_id,
    q.quiz_date::date,
    q.completed_at,
    ('game:' || q.id::text)
  from public.quiz_attempts q
  where exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where answer ? 'gameType'
    )
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where answer ->> 'attemptStatus' = 'incomplete'
    )
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where coalesce(answer ->> 'wordId', '') <> ''
        and left(answer ->> 'wordId', 2) <> '__'
    )

  union all

  -- Card reviews do not have a session id, so each active card review is one
  -- activity, matching the local Daily Learning Goal calculation.
  select
    c.user_id,
    c.review_date::date,
    c.studied_at,
    ('card:' || c.id::text)
  from public.card_reviews c
  where c.word_id is not null
    and left(c.word_id::text, 2) <> '__'
),
daily_activity_totals as (
  select
    a.user_id,
    a.activity_date,
    count(*)::bigint as activity_count,
    max(a.occurred_at) as last_activity
  from learning_activities a
  group by a.user_id, a.activity_date
),
completed_learning_days as (
  select
    a.user_id,
    a.activity_date,
    a.activity_count,
    a.last_activity,
    coalesce((
      select g.goal_count
      from public.community_daily_learning_goals g
      where g.user_id = a.user_id
      order by g.effective_date desc, g.updated_at desc
      limit 1
    ), 1) as goal_count
  from daily_activity_totals a
),
qualified_learning_days as (
  select *
  from completed_learning_days
  where activity_count >= goal_count
),
numbered_dates as (
  select
    d.user_id,
    d.activity_date,
    d.activity_date - row_number() over (
      partition by d.user_id order by d.activity_date
    )::integer as streak_group
  from qualified_learning_days d
),
streak_runs as (
  select
    user_id,
    streak_group,
    count(*)::bigint as run_length,
    max(activity_date) as run_end
  from numbered_dates
  group by user_id, streak_group
),
latest_qualified_days as (
  select
    user_id,
    max(activity_date) as latest_date
  from qualified_learning_days
  group by user_id
),
user_time_zones as (
  select distinct on (g.user_id)
    g.user_id,
    case
      when exists (select 1 from pg_timezone_names t where t.name = g.time_zone)
        then g.time_zone
      else 'UTC'
    end as time_zone
  from public.community_daily_learning_goals g
  order by g.user_id, g.effective_date desc, g.updated_at desc
),
local_today as (
  select
    u.user_id,
    timezone(coalesce(z.time_zone, 'UTC'), now())::date as today
  from (select distinct user_id from qualified_learning_days) u
  left join user_time_zones z on z.user_id = u.user_id
),
current_streaks as (
  select r.user_id, r.run_length as streak_days
  from streak_runs r
  join latest_qualified_days l
    on l.user_id = r.user_id and l.latest_date = r.run_end
  join local_today t on t.user_id = r.user_id
  where l.latest_date >= t.today - 1
),
streak_totals as (
  select
    user_id,
    count(*)::bigint as total_goal_days,
    max(last_activity) as latest_completion
  from qualified_learning_days
  group by user_id
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
    c.first_activity,
    null::bigint as total_goal_days,
    null::timestamptz as latest_completion
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
    r.first_activity,
    null::bigint,
    null::timestamptz
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
    t.latest_completion,
    t.total_goal_days,
    t.latest_completion
  from current_streaks s
  join streak_totals t on t.user_id = s.user_id
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
      order by
        s.metric_value desc,
        case when s.metric = 'streaks' then s.total_goal_days else s.review_count end desc nulls last,
        case when s.metric = 'streaks' then s.latest_completion end desc nulls last,
        case when s.metric <> 'streaks' then s.first_activity end asc nulls last,
        p.public_id asc
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

  select area_key, state_key, country_key
  into v_area_key, v_state_key, v_country_key
  from public.word_collector_regions
  where user_id = v_me;

  select coalesce(profile_visible and leaderboard_opt_in and leaderboard_eligible, false)
  into v_eligible
  from public.community_profiles
  where user_id = v_me;

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
    where user_id = v_me
      and (p_period = 'all_time' or first_added_at::date >= v_since_date);
    v_qualified := v_word_count > 0;
  elsif p_metric = 'retention' then
    select count(*), count(*) filter (where remembered)
    into v_review_count, v_remembered_count
    from (
      select user_id, review_date::date as review_date, remembered
      from public.card_reviews
      where user_id = v_me
      union all
      select
        q.user_id,
        q.quiz_date::date,
        (case when (answer.value ->> 'correct') in ('true', 'false') then answer.value ->> 'correct' end)::boolean
      from public.quiz_attempts q
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
      ) answer
      where q.user_id = v_me
        and (answer.value ->> 'correct') in ('true', 'false')
        and not exists (
          select 1
          from jsonb_array_elements(
            case when jsonb_typeof(q.answers) = 'array' then q.answers else '[]'::jsonb end
          ) incomplete_answer
          where incomplete_answer.value ->> 'attemptStatus' = 'incomplete'
        )
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
    select coalesce(streak_days, 0)
    into v_streak_days
    from public.community_competitive_metric_rows('streaks', 'all_time', p_scope, v_me)
    where user_id = v_me;
    v_streak_days := coalesce(v_streak_days, 0);
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
    'metricValue', case p_metric when 'collectors' then v_word_count when 'retention' then v_retention_percent else coalesce(v_streak_days, 0) end,
    'reviewCount', v_review_count,
    'retentionPercent', v_retention_percent,
    'retentionScore', v_retention_score,
    'streakDays', coalesce(v_streak_days, 0),
    'qualified', v_qualified,
    'reviewsToQualify', greatest(0, 40 - v_review_count),
    'locationLabel', v_location_label
  );
end;
$$;

revoke all on function public.community_set_daily_learning_goal(integer, text, text), public.community_competitive_metric_rows(text, text, text, uuid), public.community_competitive_metric_context(text, text, text) from public, anon, authenticated;
grant execute on function public.community_set_daily_learning_goal(integer, text, text), public.community_competitive_metric_context(text, text, text) to authenticated;

notify pgrst, 'reload schema';
