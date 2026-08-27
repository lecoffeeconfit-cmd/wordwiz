-- The mobile app applies the learner's current Daily Learning Goal when it
-- recalculates streak history. Keep one private current-goal record per user
-- so the server's qualified days match that behavior exactly after a goal
-- change. The goal still affects qualification only; it never adds points.

delete from public.community_daily_learning_goals older
where exists (
  select 1
  from public.community_daily_learning_goals newer
  where newer.user_id = older.user_id
    and newer.effective_date > older.effective_date
);

update public.community_daily_learning_goals
set effective_date = date '1970-01-01';

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
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_goal is null or p_goal < 1 or p_goal > 50 then
    raise exception 'invalid_daily_learning_goal' using errcode = '22023';
  end if;

  if not exists (select 1 from pg_timezone_names where name = v_time_zone) then
    v_time_zone := 'UTC';
  end if;

  insert into public.community_daily_learning_goals (
    user_id, effective_date, goal_count, time_zone, updated_at
  )
  values (v_user_id, date '1970-01-01', v_goal, v_time_zone, now())
  on conflict (user_id, effective_date) do update
  set goal_count = excluded.goal_count,
      time_zone = excluded.time_zone,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.community_set_daily_learning_goal(integer, text, text) from public, anon, authenticated;
grant execute on function public.community_set_daily_learning_goal(integer, text, text) to authenticated;

notify pgrst, 'reload schema';
