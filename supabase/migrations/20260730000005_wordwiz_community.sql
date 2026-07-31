-- WordWiz Community is fully opt-in. Existing identity, learning, and access
-- records remain private and are not altered by this migration.

create table if not exists public.community_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.community_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id uuid not null default gen_random_uuid() unique,
  display_name text,
  display_name_normalized text unique,
  friend_code text not null unique,
  avatar_path text,
  avatar_updated_at timestamptz,
  leaderboard_opt_in boolean not null default false,
  friend_requests_enabled boolean not null default true,
  nudges_enabled boolean not null default true,
  push_nudges_enabled boolean not null default false,
  leaderboard_eligible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (display_name is null or char_length(trim(display_name)) between 3 and 24),
  check (friend_code ~ '^[A-Z0-9]{8}$')
);

create table if not exists public.community_xp_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  xp_amount integer not null check (xp_amount >= 0),
  source_type text not null check (source_type in ('quiz_attempt', 'card_review', 'baseline')),
  source_id uuid,
  idempotency_key text not null unique,
  occurred_at timestamptz not null,
  period_eligible boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.community_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  pair_low_id uuid generated always as (least(requester_id, recipient_id)) stored,
  pair_high_id uuid generated always as (greatest(requester_id, recipient_id)) stored,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id),
  unique (pair_low_id, pair_high_id)
);

create table if not exists public.community_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id)
);
create table if not exists public.community_mutes (
  user_id uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id), check (user_id <> muted_user_id)
);
create table if not exists public.community_nudges (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  nudge_type text not null check (nudge_type in ('study_reminder','streak_reminder','five_word_challenge','encouragement')),
  idempotency_key uuid not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create table if not exists public.community_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios','android')),
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment','spam','inappropriate_name','other')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);

create index if not exists community_xp_period_idx on public.community_xp_ledger (occurred_at desc, user_id) where period_eligible;
create index if not exists community_friendships_participant_idx on public.community_friendships (requester_id, recipient_id, status);
create index if not exists community_nudges_recipient_idx on public.community_nudges (recipient_id, created_at desc);

alter table public.community_settings enable row level security;
alter table public.community_profiles enable row level security;
alter table public.community_xp_ledger enable row level security;
alter table public.community_friendships enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_mutes enable row level security;
alter table public.community_nudges enable row level security;
alter table public.community_push_tokens enable row level security;
alter table public.community_reports enable row level security;

create policy "community setting readable" on public.community_settings for select to authenticated using (true);
create policy "community profile owner read" on public.community_profiles for select to authenticated using (auth.uid() = user_id);
create policy "community friendship participants read" on public.community_friendships for select to authenticated using (auth.uid() in (requester_id, recipient_id));
create policy "community nudge participants read" on public.community_nudges for select to authenticated using (auth.uid() in (sender_id, recipient_id));
create policy "community nudge recipient read update" on public.community_nudges for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create or replace function public.community_friend_code()
returns text language plpgsql volatile set search_path = public as $$
declare v_code text;
begin loop
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  exit when not exists (select 1 from public.community_profiles where friend_code = v_code);
end loop; return v_code; end; $$;

create or replace function public.community_quiz_xp()
returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.community_xp_ledger(user_id,xp_amount,source_type,source_id,idempotency_key,occurred_at)
values(new.user_id,greatest(new.score,0)*5,'quiz_attempt',new.id,'quiz:'||new.id::text,new.completed_at)
on conflict(idempotency_key) do nothing; return new; end; $$;
create or replace function public.community_card_xp()
returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.community_xp_ledger(user_id,xp_amount,source_type,source_id,idempotency_key,occurred_at)
values(new.user_id,case when new.remembered then 2 else 1 end,'card_review',new.id,'card:'||new.id::text,new.studied_at)
on conflict(idempotency_key) do nothing; return new; end; $$;
drop trigger if exists community_xp_quiz_insert on public.quiz_attempts;
create trigger community_xp_quiz_insert after insert on public.quiz_attempts for each row execute function public.community_quiz_xp();
drop trigger if exists community_xp_card_insert on public.card_reviews;
create trigger community_xp_card_insert after insert on public.card_reviews for each row execute function public.community_card_xp();

insert into public.community_xp_ledger(user_id,xp_amount,source_type,idempotency_key,occurred_at,period_eligible)
select u.id, coalesce((select sum(q.score*5) from public.quiz_attempts q where q.user_id=u.id),0)+coalesce((select sum(case when c.remembered then 2 else 1 end) from public.card_reviews c where c.user_id=u.id),0),'baseline','baseline:'||u.id::text,now(),false from auth.users u on conflict(idempotency_key) do nothing;

create or replace function public.community_setup_profile(p_name text, p_leaderboard boolean, p_requests boolean, p_nudges boolean, p_push_nudges boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid:=auth.uid(); v_name text:=trim(p_name); v_code text;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if v_name !~ '^[A-Za-z0-9 _-]{3,24}$' or v_name ~* '(wordwiz|admin|support|https?://|@)' then raise exception 'invalid_display_name' using errcode='22023'; end if;
  select friend_code into v_code from public.community_profiles where user_id=v_user;
  if v_code is null then v_code:=public.community_friend_code(); end if;
  insert into public.community_profiles(user_id,display_name,display_name_normalized,friend_code,leaderboard_opt_in,friend_requests_enabled,nudges_enabled,push_nudges_enabled)
  values(v_user,v_name,lower(v_name),v_code,p_leaderboard,p_requests,p_nudges,p_push_nudges)
  on conflict(user_id) do update set display_name=excluded.display_name,display_name_normalized=excluded.display_name_normalized,leaderboard_opt_in=excluded.leaderboard_opt_in,friend_requests_enabled=excluded.friend_requests_enabled,nudges_enabled=excluded.nudges_enabled,push_nudges_enabled=excluded.push_nudges_enabled,updated_at=now();
  return jsonb_build_object('displayName',v_name,'friendCode',v_code,'leaderboardOptIn',p_leaderboard,'friendRequestsEnabled',p_requests,'nudgesEnabled',p_nudges,'pushNudgesEnabled',p_push_nudges);
exception when unique_violation then raise exception 'display_name_unavailable' using errcode='23505'; end; $$;

create or replace function public.community_leaderboard(p_period text default 'weekly', p_limit integer default 20, p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
 with bounds as (select case p_period when 'daily' then date_trunc('day',timezone('UTC',now())) when 'weekly' then date_trunc('week',timezone('UTC',now())) when 'all_time' then null else null end since_at),
 totals as (select l.user_id,sum(l.xp_amount)::bigint xp,min(l.occurred_at) first_earned from public.community_xp_ledger l cross join bounds b where p_period in('daily','weekly','all_time') and (p_period='all_time' or (l.period_eligible and l.occurred_at>=b.since_at)) group by l.user_id),
 ranked as (select p.user_id,p.public_id,p.display_name,p.avatar_path,t.xp,row_number() over(order by t.xp desc,t.first_earned asc,p.public_id asc) rank from totals t join public.community_profiles p on p.user_id=t.user_id where p.leaderboard_opt_in and p.leaderboard_eligible)
 select coalesce(jsonb_agg(jsonb_build_object('rank',rank,'publicId',public_id,'displayName',display_name,'avatarPath',avatar_path,'xp',xp,'isMe',user_id=auth.uid()) order by rank),'[]'::jsonb) from (select * from ranked order by rank limit least(greatest(p_limit,1),50) offset greatest(p_offset,0)) page; $$;

create or replace function public.community_my_context(p_period text default 'weekly')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_me uuid:=auth.uid(); v_profile public.community_profiles%rowtype; v_xp bigint:=0; v_rank bigint; v_unread bigint:=0; v_requests bigint:=0; v_since timestamptz;
begin
 if v_me is null then raise exception 'authentication_required' using errcode='42501'; end if;
 select * into v_profile from public.community_profiles where user_id=v_me;
 if p_period='daily' then v_since:=date_trunc('day',timezone('UTC',now())); elsif p_period='weekly' then v_since:=date_trunc('week',timezone('UTC',now())); elsif p_period='all_time' then v_since:=null; else raise exception 'invalid_period' using errcode='22023'; end if;
 select coalesce(sum(xp_amount),0) into v_xp from public.community_xp_ledger where user_id=v_me and (p_period='all_time' or(period_eligible and occurred_at>=v_since));
 if coalesce(v_profile.leaderboard_opt_in,false) and coalesce(v_profile.leaderboard_eligible,false) then select rank into v_rank from (select l.user_id,row_number() over(order by sum(l.xp_amount) desc,min(l.occurred_at),p.public_id) rank from public.community_xp_ledger l join public.community_profiles p on p.user_id=l.user_id where p.leaderboard_opt_in and p.leaderboard_eligible and (p_period='all_time' or(l.period_eligible and l.occurred_at>=v_since)) group by l.user_id,p.public_id) ranked where user_id=v_me; end if;
 select count(*) into v_unread from public.community_nudges where recipient_id=v_me and read_at is null;
 select count(*) into v_requests from public.community_friendships where recipient_id=v_me and status='pending';
 return jsonb_build_object('enabled',(select enabled from public.community_settings where id),'profile',case when v_profile.user_id is null then null else jsonb_build_object('displayName',v_profile.display_name,'friendCode',v_profile.friend_code,'avatarPath',v_profile.avatar_path,'leaderboardOptIn',v_profile.leaderboard_opt_in,'friendRequestsEnabled',v_profile.friend_requests_enabled,'nudgesEnabled',v_profile.nudges_enabled,'pushNudgesEnabled',v_profile.push_nudges_enabled) end,'xp',v_xp,'rank',v_rank,'unreadNudges',v_unread,'incomingRequests',v_requests); end; $$;

create or replace function public.community_send_friend_request(p_friend_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid:=auth.uid(); v_target uuid;
begin
 if v_me is null then raise exception 'authentication_required' using errcode='42501'; end if;
 select user_id into v_target from public.community_profiles where friend_code=upper(trim(p_friend_code)) and friend_requests_enabled;
 if v_target is null then raise exception 'friend_code_not_available' using errcode='22023'; end if;
 if v_target=v_me then raise exception 'cannot_add_yourself' using errcode='22023'; end if;
 if exists(select 1 from public.community_blocks where (blocker_id=v_me and blocked_id=v_target)or(blocker_id=v_target and blocked_id=v_me)) then raise exception 'relationship_unavailable' using errcode='42501'; end if;
 insert into public.community_friendships(requester_id,recipient_id) values(v_me,v_target);
exception when unique_violation then raise exception 'friend_request_already_exists' using errcode='23505'; end; $$;

create or replace function public.community_respond_friend_request(p_request_id uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$ begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 update public.community_friendships set status=case when p_accept then 'accepted' else 'declined' end,responded_at=now() where id=p_request_id and recipient_id=auth.uid() and status='pending';
 if not found then raise exception 'friend_request_not_available' using errcode='22023'; end if; end; $$;

create or replace function public.community_connections()
returns jsonb language sql stable security definer set search_path = public as $$
 select coalesce(jsonb_agg(jsonb_build_object('requestId',f.id,'status',f.status,'direction',case when f.requester_id=auth.uid() then 'outgoing' else 'incoming' end,'publicId',p.public_id,'displayName',p.display_name,'avatarPath',p.avatar_path,'isMuted',exists(select 1 from public.community_mutes m where m.user_id=auth.uid() and m.muted_user_id=p.user_id)) order by f.created_at desc),'[]'::jsonb) from public.community_friendships f join public.community_profiles p on p.user_id=case when f.requester_id=auth.uid() then f.recipient_id else f.requester_id end where auth.uid() in(f.requester_id,f.recipient_id) and f.status in('pending','accepted'); $$;

create or replace function public.community_remove_or_block(p_public_id uuid,p_block boolean)
returns void language plpgsql security definer set search_path = public as $$ declare v_target uuid; begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 select user_id into v_target from public.community_profiles where public_id=p_public_id; if v_target is null or v_target=auth.uid() then raise exception 'invalid_relationship' using errcode='22023'; end if;
 delete from public.community_friendships where (requester_id=auth.uid() and recipient_id=v_target)or(requester_id=v_target and recipient_id=auth.uid());
 if p_block then insert into public.community_blocks(blocker_id,blocked_id) values(auth.uid(),v_target) on conflict do nothing; end if; end; $$;

create or replace function public.community_set_mute(p_public_id uuid,p_muted boolean)
returns void language plpgsql security definer set search_path = public as $$ declare v_target uuid; begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if; select user_id into v_target from public.community_profiles where public_id=p_public_id; if v_target is null or v_target=auth.uid() then raise exception 'invalid_relationship' using errcode='22023'; end if;
 if p_muted then insert into public.community_mutes(user_id,muted_user_id) values(auth.uid(),v_target) on conflict do nothing; else delete from public.community_mutes where user_id=auth.uid() and muted_user_id=v_target; end if; end; $$;

create or replace function public.community_nudge_inbox(p_limit integer default 30,p_offset integer default 0)
returns jsonb language sql stable security definer set search_path = public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'nudgeType',n.nudge_type,'readAt',n.read_at,'createdAt',n.created_at,'senderPublicId',p.public_id,'senderName',p.display_name,'senderAvatarPath',p.avatar_path) order by n.created_at desc),'[]'::jsonb) from (select * from public.community_nudges where recipient_id=auth.uid() order by created_at desc limit least(greatest(p_limit,1),50) offset greatest(p_offset,0)) n join public.community_profiles p on p.user_id=n.sender_id; $$;
create or replace function public.community_mark_nudge_read(p_nudge_id uuid)
returns void language plpgsql security definer set search_path = public as $$ begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if; update public.community_nudges set read_at=coalesce(read_at,now()) where id=p_nudge_id and recipient_id=auth.uid(); if not found then raise exception 'nudge_not_available' using errcode='22023'; end if; end; $$;
create or replace function public.community_register_push_token(p_token text,p_platform text)
returns void language plpgsql security definer set search_path = public as $$ begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if; if p_token !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$' or p_platform not in('ios','android') then raise exception 'invalid_push_token' using errcode='22023'; end if;
 insert into public.community_push_tokens(user_id,expo_push_token,platform,active,last_seen_at,updated_at) values(auth.uid(),p_token,p_platform,true,now(),now()) on conflict(expo_push_token) do update set user_id=excluded.user_id,platform=excluded.platform,active=true,last_seen_at=now(),updated_at=now(); end; $$;
create or replace function public.community_deactivate_my_push_tokens()
returns void language sql security definer set search_path = public as $$ update public.community_push_tokens set active=false,updated_at=now() where user_id=auth.uid(); $$;

revoke all on function public.community_nudge_inbox(integer,integer),public.community_mark_nudge_read(uuid),public.community_register_push_token(text,text),public.community_deactivate_my_push_tokens() from public;
grant execute on function public.community_nudge_inbox(integer,integer),public.community_mark_nudge_read(uuid),public.community_register_push_token(text,text),public.community_deactivate_my_push_tokens() to authenticated;

revoke all on function public.community_setup_profile(text,boolean,boolean,boolean,boolean),public.community_leaderboard(text,integer,integer),public.community_my_context(text),public.community_send_friend_request(text),public.community_respond_friend_request(uuid,boolean),public.community_connections(),public.community_remove_or_block(uuid,boolean),public.community_set_mute(uuid,boolean) from public;
grant execute on function public.community_setup_profile(text,boolean,boolean,boolean,boolean),public.community_leaderboard(text,integer,integer),public.community_my_context(text),public.community_send_friend_request(text),public.community_respond_friend_request(uuid,boolean),public.community_connections(),public.community_remove_or_block(uuid,boolean),public.community_set_mute(uuid,boolean) to authenticated;

create or replace function public.community_create_nudge(p_recipient_public_id uuid,p_nudge_type text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_me uuid:=auth.uid(); v_target uuid; v_allowed boolean; v_recent integer;
begin
  if v_me is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_nudge_type not in ('study_reminder','streak_reminder','five_word_challenge','encouragement') then raise exception 'invalid_nudge_type' using errcode='22023'; end if;
  select user_id,nudges_enabled into v_target,v_allowed from public.community_profiles where public_id=p_recipient_public_id;
  if v_target is null or not coalesce(v_allowed,false) then raise exception 'nudge_unavailable' using errcode='22023'; end if;
  if v_target=v_me or exists(select 1 from public.community_blocks where (blocker_id=v_me and blocked_id=v_target) or (blocker_id=v_target and blocked_id=v_me)) then raise exception 'nudge_unavailable' using errcode='42501'; end if;
  if not exists(select 1 from public.community_friendships where status='accepted' and ((requester_id=v_me and recipient_id=v_target) or (requester_id=v_target and recipient_id=v_me))) then raise exception 'friendship_required' using errcode='42501'; end if;
  select count(*) into v_recent from public.community_nudges where sender_id=v_me and created_at>=now()-interval '24 hours';
  if v_recent>=10 or exists(select 1 from public.community_nudges where sender_id=v_me and recipient_id=v_target and created_at>=now()-interval '12 hours') then raise exception 'nudge_rate_limited' using errcode='42901'; end if;
  insert into public.community_nudges(sender_id,recipient_id,nudge_type,idempotency_key) values(v_me,v_target,p_nudge_type,p_idempotency_key) on conflict(idempotency_key) do nothing;
  return jsonb_build_object('queued',true);
end; $$;

create or replace function public.community_report_user(p_public_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_reason not in ('harassment','spam','inappropriate_name','other') then raise exception 'invalid_report_reason' using errcode='22023'; end if;
  select user_id into v_target from public.community_profiles where public_id=p_public_id;
  if v_target is null or v_target=auth.uid() then raise exception 'invalid_report_target' using errcode='22023'; end if;
  insert into public.community_reports(reporter_id,reported_user_id,reason) values(auth.uid(),v_target,p_reason);
end; $$;
revoke all on function public.community_create_nudge(uuid,text,uuid),public.community_report_user(uuid,text) from public;
grant execute on function public.community_create_nudge(uuid,text,uuid),public.community_report_user(uuid,text) to authenticated;

-- Community is included in the existing privacy-safe aggregate page-time
-- telemetry. No learner content is stored with the session.
alter table public.screen_time_sessions drop constraint if exists screen_time_sessions_screen_check;
alter table public.screen_time_sessions add constraint screen_time_sessions_screen_check check (screen in ('home','words','cards','quiz','dashboard','community'));
alter table public.screen_time_daily drop constraint if exists screen_time_daily_screen_check;
alter table public.screen_time_daily add constraint screen_time_daily_screen_check check (screen in ('home','words','cards','quiz','dashboard','community'));
create or replace function public.record_my_screen_time(p_screen text,p_duration_seconds integer,p_started_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$ begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if p_screen not in ('home','words','cards','quiz','dashboard','community') then raise exception 'invalid_screen' using errcode='22023'; end if;
  if p_duration_seconds < 3 or p_duration_seconds > 14400 then raise exception 'invalid_duration' using errcode='22023'; end if;
  insert into public.screen_time_sessions(user_id,screen,duration_seconds,started_at) values(auth.uid(),p_screen,p_duration_seconds,p_started_at);
end; $$;

notify pgrst, 'reload schema';
