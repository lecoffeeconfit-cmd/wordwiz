-- Keep Admin time analytics compact without changing learner-facing behavior.
-- Raw screen sessions are retained for 90 days; privacy-safe daily totals
-- preserve aggregate Admin reporting indefinitely.

create table if not exists public.screen_time_daily (
  activity_date date not null,
  screen text not null check (screen in ('home', 'words', 'cards', 'quiz', 'dashboard')),
  total_seconds bigint not null default 0 check (total_seconds >= 0),
  session_count bigint not null default 0 check (session_count >= 0),
  primary key (activity_date, screen)
);

create table if not exists public.analytics_retention_jobs (
  job_name text primary key,
  last_run_at timestamptz not null default now()
);

alter table public.screen_time_daily enable row level security;
alter table public.analytics_retention_jobs enable row level security;

-- Backfill the aggregate once before raw records begin ageing out.
insert into public.screen_time_daily (
  activity_date,
  screen,
  total_seconds,
  session_count
)
select
  timezone('UTC', started_at)::date,
  screen,
  sum(duration_seconds)::bigint,
  count(*)::bigint
from public.screen_time_sessions
group by timezone('UTC', started_at)::date, screen
on conflict (activity_date, screen) do nothing;

create or replace function public.aggregate_and_prune_screen_time_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.screen_time_daily (
    activity_date,
    screen,
    total_seconds,
    session_count
  )
  values (
    timezone('UTC', new.started_at)::date,
    new.screen,
    new.duration_seconds,
    1
  )
  on conflict (activity_date, screen) do update
    set total_seconds = public.screen_time_daily.total_seconds + excluded.total_seconds,
        session_count = public.screen_time_daily.session_count + excluded.session_count;

  -- At most one insert initiator performs the cleanup each day, keeping
  -- regular tab changes inexpensive even as the learner base grows.
  insert into public.analytics_retention_jobs (job_name, last_run_at)
  values ('screen_time_raw_retention', now())
  on conflict (job_name) do update
    set last_run_at = excluded.last_run_at
    where public.analytics_retention_jobs.last_run_at < now() - interval '1 day';

  if found then
    delete from public.screen_time_sessions
    where started_at < now() - interval '90 days';
  end if;

  return new;
end;
$$;

drop trigger if exists aggregate_and_prune_screen_time_session on public.screen_time_sessions;
create trigger aggregate_and_prune_screen_time_session
after insert on public.screen_time_sessions
for each row execute function public.aggregate_and_prune_screen_time_session();

create or replace function public.admin_dashboard_screen_time(p_range text default '30d')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with range_window as (
    select
      case p_range
        when 'today' then timezone('UTC', now())::date
        when '7d' then (timezone('UTC', now())::date - 6)
        when 'all' then null
        else (timezone('UTC', now())::date - 29)
      end as starts_on,
      p_range = 'all' as is_all_time
  )
  select coalesce(
    jsonb_object_agg(
      screen,
      jsonb_build_object(
        'seconds', total_seconds,
        'sessions', session_count
      )
    ),
    '{}'::jsonb
  )
  from (
    select
      screen,
      sum(total_seconds)::bigint as total_seconds,
      sum(session_count)::bigint as session_count
    from public.screen_time_daily
    cross join range_window rw
    where rw.is_all_time or activity_date >= rw.starts_on
    group by screen
  ) daily_time;
$$;

revoke all on function public.admin_dashboard_screen_time(text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_screen_time(text) to service_role;

notify pgrst, 'reload schema';
