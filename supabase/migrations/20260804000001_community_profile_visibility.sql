-- Let learners hide their public Connect profile while keeping private friend
-- connections available. Only an aggregate word count is exposed publicly.
alter table public.community_profiles
  add column if not exists profile_visible boolean not null default true;

create or replace function public.community_setup_profile(
  p_name text,
  p_profile_visible boolean,
  p_leaderboard boolean,
  p_requests boolean,
  p_nudges boolean,
  p_push_nudges boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text := trim(p_name);
  v_code text;
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if v_name !~ '^[A-Za-z0-9 _-]{3,24}$' or v_name ~* '(wordwiz|admin|support|https?://|@)' then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;
  select friend_code into v_code from public.community_profiles where user_id = v_user;
  if v_code is null then v_code := public.community_friend_code(); end if;

  insert into public.community_profiles(
    user_id, display_name, display_name_normalized, friend_code,
    profile_visible, leaderboard_opt_in, friend_requests_enabled,
    nudges_enabled, push_nudges_enabled
  )
  values(
    v_user, v_name, lower(v_name), v_code,
    p_profile_visible, p_leaderboard, p_requests, p_nudges, p_push_nudges
  )
  on conflict(user_id) do update set
    display_name = excluded.display_name,
    display_name_normalized = excluded.display_name_normalized,
    profile_visible = excluded.profile_visible,
    leaderboard_opt_in = excluded.leaderboard_opt_in,
    friend_requests_enabled = excluded.friend_requests_enabled,
    nudges_enabled = excluded.nudges_enabled,
    push_nudges_enabled = excluded.push_nudges_enabled,
    updated_at = now();

  return jsonb_build_object(
    'displayName', v_name,
    'friendCode', v_code,
    'profileVisible', p_profile_visible,
    'leaderboardOptIn', p_leaderboard,
    'friendRequestsEnabled', p_requests,
    'nudgesEnabled', p_nudges,
    'pushNudgesEnabled', p_push_nudges
  );
exception when unique_violation then
  raise exception 'display_name_unavailable' using errcode = '23505';
end;
$$;

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
  word_counts as (
    select user_id, count(*)::bigint as word_count
    from public.words
    group by user_id
  ),
  ranked_base as (
    select
      p.user_id,
      p.public_id,
      p.display_name,
      p.avatar_path,
      coalesce(w.word_count, 0) as word_count,
      coalesce(t.xp, 0) as xp,
      row_number() over (
        order by coalesce(t.xp, 0) desc, coalesce(t.first_earned, p.created_at) asc, p.public_id asc
      ) as rank,
      count(*) over() as total_users
    from public.community_profiles p
    left join period_totals t on t.user_id = p.user_id
    left join word_counts w on w.user_id = p.user_id
    where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
  ),
  ranked as (
    select *, public.community_leaderboard_level(rank, total_users) as level
    from ranked_base
  ),
  filtered as (
    select * from ranked where p_level is null or level = p_level
  )
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'rank', rank,
      'publicId', public_id,
      'displayName', display_name,
      'avatarPath', avatar_path,
      'wordCount', word_count,
      'xp', xp,
      'level', level,
      'isMe', user_id = auth.uid()
    ) order by rank),
    '[]'::jsonb
  )
  from (
    select * from filtered
    order by rank
    limit least(greatest(p_limit, 1), 50)
    offset greatest(p_offset, 0)
  ) page;
$$;

create or replace function public.community_my_context(p_period text default 'weekly')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
  where user_id = v_me and (p_period = 'all_time' or (period_eligible and occurred_at >= v_since));
  select coalesce(sum(xp_amount), 0) into v_all_time_xp
  from public.community_xp_ledger where user_id = v_me;

  if coalesce(v_profile.profile_visible, false)
     and coalesce(v_profile.leaderboard_opt_in, false)
     and coalesce(v_profile.leaderboard_eligible, false) then
    select rank, total_users into v_rank, v_total_users from (
      select
        p.user_id,
        row_number() over (
          order by coalesce(sum(l.xp_amount), 0) desc,
                   coalesce(min(l.occurred_at), p.created_at) asc,
                   p.public_id asc
        ) as rank,
        count(*) over() as total_users
      from public.community_profiles p
      left join public.community_xp_ledger l on l.user_id = p.user_id
        and (p_period = 'all_time' or (l.period_eligible and l.occurred_at >= v_since))
      where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
      group by p.user_id, p.created_at, p.public_id
    ) ranked where user_id = v_me;
  end if;

  with ranked as (
    select
      p.user_id,
      row_number() over (
        order by coalesce(sum(l.xp_amount), 0) desc,
                 coalesce(min(l.occurred_at), p.created_at) asc,
                 p.public_id asc
      ) as rank,
      count(*) over() as total_users
    from public.community_profiles p
    left join public.community_xp_ledger l on l.user_id = p.user_id
      and (p_period = 'all_time' or (l.period_eligible and l.occurred_at >= v_since))
    where p.profile_visible and p.leaderboard_opt_in and p.leaderboard_eligible
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
      'profileVisible', v_profile.profile_visible,
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

create or replace function public.community_send_friend_request_by_public_id(p_public_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_existing_id uuid;
  v_existing_status text;
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select user_id into v_target
  from public.community_profiles
  where public_id = p_public_id and profile_visible and friend_requests_enabled;
  if v_target is null then raise exception 'friend_request_not_available' using errcode = '22023'; end if;
  if v_target = v_me then raise exception 'cannot_add_yourself' using errcode = '22023'; end if;
  if exists (
    select 1 from public.community_blocks
    where (blocker_id = v_me and blocked_id = v_target)
       or (blocker_id = v_target and blocked_id = v_me)
  ) then raise exception 'relationship_unavailable' using errcode = '42501'; end if;

  select id, status into v_existing_id, v_existing_status
  from public.community_friendships
  where pair_low_id = least(v_me, v_target) and pair_high_id = greatest(v_me, v_target);
  if v_existing_status = 'declined' then
    update public.community_friendships
    set requester_id = v_me, recipient_id = v_target, status = 'pending', created_at = now(), responded_at = null
    where id = v_existing_id;
    return;
  end if;
  if v_existing_id is not null then raise exception 'friend_request_already_exists' using errcode = '23505'; end if;
  insert into public.community_friendships(requester_id, recipient_id) values (v_me, v_target);
exception when unique_violation then
  raise exception 'friend_request_already_exists' using errcode = '23505';
end;
$$;

revoke all on function public.community_setup_profile(text, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.community_setup_profile(text, boolean, boolean, boolean, boolean, boolean) to authenticated;
revoke all on function public.community_leaderboard(text, integer, integer, text), public.community_my_context(text), public.community_send_friend_request_by_public_id(uuid) from public;
grant execute on function public.community_leaderboard(text, integer, integer, text), public.community_my_context(text), public.community_send_friend_request_by_public_id(uuid) to authenticated;

notify pgrst, 'reload schema';
