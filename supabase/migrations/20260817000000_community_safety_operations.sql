-- Add content-specific reporting, an auditable first-upload notice, and
-- practical moderation actions for the private Admin Center.

alter table public.community_profiles
  add column if not exists avatar_moderation_notice_at timestamptz;

alter table public.community_reports
  drop constraint if exists community_reports_reason_check;
alter table public.community_reports
  add constraint community_reports_reason_check
  check (reason in ('harassment', 'spam', 'inappropriate_name', 'inappropriate_avatar', 'other'));

create or replace function public.community_report_user(p_public_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_reason not in ('harassment', 'spam', 'inappropriate_name', 'inappropriate_avatar', 'other') then
    raise exception 'invalid_report_reason' using errcode='22023';
  end if;
  select user_id into v_target from public.community_profiles where public_id = p_public_id;
  if v_target is null or v_target = auth.uid() then raise exception 'invalid_report_target' using errcode='22023'; end if;
  insert into public.community_reports(reporter_id, reported_user_id, reason) values(auth.uid(), v_target, p_reason);
end; $$;

revoke all on function public.community_report_user(uuid, text) from public;
grant execute on function public.community_report_user(uuid, text) to authenticated;

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
  range_nudges as (
    select n.* from public.community_nudges n cross join range_window rw
    where rw.all_time or n.created_at >= rw.starts_at
  ),
  range_friendships as (
    select f.* from public.community_friendships f cross join range_window rw
    where rw.all_time or f.created_at >= rw.starts_at
  ),
  metrics as (
    select
      (select count(*) from public.community_profiles) as profiles,
      (select count(*) from public.community_profiles where leaderboard_opt_in and leaderboard_eligible) as leaderboard_profiles,
      (select count(*) from public.community_friendships where status = 'accepted') as accepted_friendships,
      (select count(*) from public.community_friendships where status = 'pending') as pending_friendships,
      (select count(*) from range_friendships) as friend_requests_sent,
      (select count(*) from range_friendships where status = 'accepted' and responded_at is not null) as friend_requests_accepted,
      (select count(*) from range_friendships where status = 'declined' and responded_at is not null) as friend_requests_declined,
      (select count(*) from range_nudges) as nudges_sent,
      (select count(distinct sender_id) from range_nudges) as nudge_senders,
      (select count(*) from range_nudges where read_at is not null) as nudges_read,
      (select count(*) from public.community_nudges where read_at is null) as unread_nudges,
      (select count(*) from public.community_push_tokens where active) as active_push_tokens,
      (select count(*) from public.community_reports where status = 'open') as open_reports
  ),
  top_nudgers as (
    select p.public_id, p.display_name, count(*)::bigint as nudges
    from range_nudges n join public.community_profiles p on p.user_id = n.sender_id
    group by p.public_id, p.display_name order by nudges desc, p.display_name asc limit 5
  ),
  connection_counts as (
    select participant_id as user_id, count(*)::bigint as connections from (
      select requester_id as participant_id from public.community_friendships where status = 'accepted'
      union all select recipient_id as participant_id from public.community_friendships where status = 'accepted'
    ) participants group by participant_id
  ),
  nudge_activity as (
    select user_id, sum(sent)::bigint as sent, sum(received)::bigint as received from (
      select sender_id as user_id, 1::bigint as sent, 0::bigint as received from range_nudges
      union all select recipient_id as user_id, 0::bigint, 1::bigint from range_nudges
    ) activity group by user_id
  ),
  top_connectors as (
    select p.public_id, p.display_name, coalesce(c.connections, 0)::bigint as connections,
      coalesce(a.sent, 0)::bigint as nudges_sent, coalesce(a.received, 0)::bigint as nudges_received
    from public.community_profiles p join nudge_activity a on a.user_id = p.user_id
    left join connection_counts c on c.user_id = p.user_id
    order by (coalesce(a.sent, 0) + coalesce(a.received, 0)) desc, c.connections desc, p.display_name asc limit 5
  ),
  nudge_templates as (
    select coalesce(nullif(message_key, ''), nudge_type) as message_key, count(*)::bigint as sends
    from range_nudges group by coalesce(nullif(message_key, ''), nudge_type)
    order by sends desc, message_key asc limit 6
  ),
  report_totals as (
    select reported_user_id, count(*)::integer as report_count, min(created_at) as oldest_created_at
    from public.community_reports where status = 'open' group by reported_user_id
  ),
  reports as (
    select distinct on (r.reported_user_id)
      r.id, r.reported_user_id, p.display_name, r.reason, r.status, r.created_at,
      t.report_count, t.oldest_created_at
    from public.community_reports r
    join public.community_profiles p on p.user_id = r.reported_user_id
    join report_totals t on t.reported_user_id = r.reported_user_id
    where r.status = 'open'
    order by r.reported_user_id, r.created_at desc
  )
  select jsonb_build_object(
    'profiles', metrics.profiles,
    'leaderboardProfiles', metrics.leaderboard_profiles,
    'acceptedFriendships', metrics.accepted_friendships,
    'pendingFriendships', metrics.pending_friendships,
    'friendRequestsSent', metrics.friend_requests_sent,
    'friendRequestsAccepted', metrics.friend_requests_accepted,
    'friendRequestsDeclined', metrics.friend_requests_declined,
    'nudgesSent', metrics.nudges_sent,
    'nudgeSenders', metrics.nudge_senders,
    'nudgesRead', metrics.nudges_read,
    'unreadNudges', metrics.unread_nudges,
    'activePushTokens', metrics.active_push_tokens,
    'openReports', metrics.open_reports,
    'topNudgers', coalesce((select jsonb_agg(jsonb_build_object('publicId', public_id, 'displayName', display_name, 'nudges', nudges) order by nudges desc, display_name asc) from top_nudgers), '[]'::jsonb),
    'topConnectors', coalesce((select jsonb_agg(jsonb_build_object('publicId', public_id, 'displayName', display_name, 'connections', connections, 'nudgesSent', nudges_sent, 'nudgesReceived', nudges_received) order by (nudges_sent + nudges_received) desc, connections desc, display_name asc) from top_connectors), '[]'::jsonb),
    'nudgeTemplates', coalesce((select jsonb_agg(jsonb_build_object('messageKey', message_key, 'sends', sends) order by sends desc, message_key asc) from nudge_templates), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reportedUserId', reported_user_id, 'displayName', display_name, 'reason', reason, 'status', status, 'createdAt', created_at, 'reportCount', report_count, 'oldestCreatedAt', oldest_created_at) order by created_at desc) from (select * from reports order by created_at desc limit 12) latest_reports), '[]'::jsonb)
  ) from metrics;
$$;

revoke all on function public.admin_dashboard_community(text) from public, anon, authenticated;
grant execute on function public.admin_dashboard_community(text) to service_role;

notify pgrst, 'reload schema';
