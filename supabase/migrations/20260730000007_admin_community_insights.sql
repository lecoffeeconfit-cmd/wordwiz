-- Private Community operations insights and moderation controls. All outputs
-- are limited to the service-role Admin Center; learner clients cannot call
-- these functions or read these tables directly.

alter table public.community_reports
  add column if not exists status text not null default 'open',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table public.community_reports drop constraint if exists community_reports_status_check;
alter table public.community_reports add constraint community_reports_status_check check (status in ('open','resolved'));

create or replace function public.admin_dashboard_community(p_range text default '30d')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with range_window as (
    select case p_range
      when 'today' then date_trunc('day', timezone('UTC', now()))
      when '7d' then now() - interval '7 days'
      when 'all' then null
      else now() - interval '30 days'
    end as starts_at,
    p_range = 'all' as all_time
  ),
  metrics as (
    select
      (select count(*) from public.community_profiles) as profiles,
      (select count(*) from public.community_profiles where leaderboard_opt_in and leaderboard_eligible) as leaderboard_profiles,
      (select count(*) from public.community_friendships where status = 'accepted') as accepted_friendships,
      (select count(*) from public.community_friendships where status = 'pending') as pending_friendships,
      (select count(*) from public.community_nudges n cross join range_window rw where rw.all_time or n.created_at >= rw.starts_at) as nudges_sent,
      (select count(distinct n.sender_id) from public.community_nudges n cross join range_window rw where rw.all_time or n.created_at >= rw.starts_at) as nudge_senders,
      (select count(*) from public.community_nudges where read_at is null) as unread_nudges,
      (select count(*) from public.community_push_tokens where active) as active_push_tokens,
      (select count(*) from public.community_reports where status = 'open') as open_reports
  ),
  top_nudgers as (
    select p.public_id, p.display_name, count(*)::bigint as nudges
    from public.community_nudges n
    join public.community_profiles p on p.user_id = n.sender_id
    cross join range_window rw
    where rw.all_time or n.created_at >= rw.starts_at
    group by p.public_id, p.display_name
    order by nudges desc, p.display_name asc
    limit 5
  ),
  reports as (
    select r.id, r.reported_user_id, p.display_name, r.reason, r.status, r.created_at
    from public.community_reports r
    join public.community_profiles p on p.user_id = r.reported_user_id
    where r.status = 'open'
    order by r.created_at desc
    limit 12
  )
  select jsonb_build_object(
    'profiles', metrics.profiles,
    'leaderboardProfiles', metrics.leaderboard_profiles,
    'acceptedFriendships', metrics.accepted_friendships,
    'pendingFriendships', metrics.pending_friendships,
    'nudgesSent', metrics.nudges_sent,
    'nudgeSenders', metrics.nudge_senders,
    'unreadNudges', metrics.unread_nudges,
    'activePushTokens', metrics.active_push_tokens,
    'openReports', metrics.open_reports,
    'topNudgers', coalesce((select jsonb_agg(jsonb_build_object('publicId', public_id, 'displayName', display_name, 'nudges', nudges) order by nudges desc, display_name asc) from top_nudgers), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reportedUserId', reported_user_id, 'displayName', display_name, 'reason', reason, 'status', status, 'createdAt', created_at) order by created_at desc) from reports), '[]'::jsonb)
  ) from metrics;
$$;

revoke all on function public.admin_dashboard_community(text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_community(text) to service_role;

notify pgrst, 'reload schema';
