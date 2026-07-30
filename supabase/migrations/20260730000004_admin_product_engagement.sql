-- Privacy-safe, aggregate-only product engagement signals for Admin Center.
-- No learner content, device data, or per-person click history is stored.

create table if not exists public.stats_section_daily (
  activity_date date not null,
  section text not null check (section in (
    'practice_estimate',
    'mastery_progress',
    'retrieval_path',
    'recall_feedback',
    'recall_pace',
    'due_reviews',
    'achievements',
    'question_mix',
    'time_based_learning',
    'omega_history',
    'quiz_history'
  )),
  interaction_count bigint not null default 0 check (interaction_count >= 0),
  primary key (activity_date, section)
);

alter table public.stats_section_daily enable row level security;

create or replace function public.record_my_stats_section_interaction(p_section text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_section not in (
    'practice_estimate',
    'mastery_progress',
    'retrieval_path',
    'recall_feedback',
    'recall_pace',
    'due_reviews',
    'achievements',
    'question_mix',
    'time_based_learning',
    'omega_history',
    'quiz_history'
  ) then
    raise exception 'invalid_stats_section' using errcode = '22023';
  end if;

  insert into public.stats_section_daily (activity_date, section, interaction_count)
  values (timezone('UTC', now())::date, p_section, 1)
  on conflict (activity_date, section) do update
    set interaction_count = public.stats_section_daily.interaction_count + 1;
end;
$$;

create or replace function public.admin_dashboard_flashcard_usage(p_range text default '30d')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with range_window as (
    select
      case p_range
        when 'today' then date_trunc('day', timezone('UTC', now()))
        when '7d' then now() - interval '7 days'
        when 'all' then null
        else now() - interval '30 days'
      end as starts_at,
      p_range = 'all' as is_all_time
  )
  select jsonb_build_object(
    'reviews', count(*)::bigint,
    'learners', count(distinct c.user_id)::bigint,
    'seconds', coalesce(sum(c.duration_seconds), 0)::bigint
  )
  from public.card_reviews c
  cross join range_window rw
  where rw.is_all_time or c.studied_at >= rw.starts_at;
$$;

create or replace function public.admin_dashboard_stats_section_engagement(p_range text default '30d')
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
        when '7d' then timezone('UTC', now())::date - 6
        when 'all' then null
        else timezone('UTC', now())::date - 29
      end as starts_on,
      p_range = 'all' as is_all_time
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', section, 'interactions', interaction_count)
      order by interaction_count desc, section
    ),
    '[]'::jsonb
  )
  from (
    select section, sum(interaction_count)::bigint as interaction_count
    from public.stats_section_daily
    cross join range_window rw
    where rw.is_all_time or activity_date >= rw.starts_on
    group by section
  ) engagement;
$$;

revoke all on function public.record_my_stats_section_interaction(text) from public, anon;
grant execute on function public.record_my_stats_section_interaction(text) to authenticated;
revoke all on function public.admin_dashboard_flashcard_usage(text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_flashcard_usage(text) to service_role;
revoke all on function public.admin_dashboard_stats_section_engagement(text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_stats_section_engagement(text) to service_role;

notify pgrst, 'reload schema';
