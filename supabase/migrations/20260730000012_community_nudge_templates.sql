-- Store the precise, curated Connect nudge selected by the sender so the
-- recipient sees the same friendly message in their inbox and push alert.
alter table public.community_nudges
  add column if not exists message_key text not null default 'time_for_review';

update public.community_nudges
set message_key = case nudge_type
  when 'streak_reminder' then 'keep_streak_alive'
  when 'five_word_challenge' then 'omega_challenge'
  when 'encouragement' then 'you_got_this'
  else 'time_for_review'
end;

create or replace function public.community_create_nudge(
  p_recipient_public_id uuid,
  p_nudge_type text,
  p_message_key text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_allowed boolean;
  v_recent integer;
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if p_nudge_type not in ('study_reminder', 'streak_reminder', 'five_word_challenge', 'encouragement') then
    raise exception 'invalid_nudge_type' using errcode = '22023';
  end if;
  if p_message_key not in (
    'time_for_review', 'brain_workout', 'flashcards_waiting', 'review_before_fade',
    'omega_challenge', 'quiz_today', 'perfect_quiz', 'five_minute_session',
    'leaderboard_spot', 'race_next_level', 'who_knows_more', 'spot_not_safe',
    'you_got_this', 'keep_streak_alive', 'keep_building', 'one_more_word',
    'great_job', 'vocabulary_growing', 'true_wordwiz', 'big_brain',
    'happy_learning', 'powers_training', 'officially_nudged', 'new_word_waiting'
  ) then
    raise exception 'invalid_nudge_message' using errcode = '22023';
  end if;

  select user_id, nudges_enabled into v_target, v_allowed
  from public.community_profiles
  where public_id = p_recipient_public_id;
  if v_target is null or not coalesce(v_allowed, false) then raise exception 'nudge_unavailable' using errcode = '22023'; end if;
  if v_target = v_me or exists (
    select 1 from public.community_blocks
    where (blocker_id = v_me and blocked_id = v_target) or (blocker_id = v_target and blocked_id = v_me)
  ) then raise exception 'nudge_unavailable' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.community_friendships
    where status = 'accepted'
      and ((requester_id = v_me and recipient_id = v_target) or (requester_id = v_target and recipient_id = v_me))
  ) then raise exception 'friendship_required' using errcode = '42501'; end if;

  select count(*) into v_recent from public.community_nudges where sender_id = v_me and created_at >= now() - interval '24 hours';
  if v_recent >= 10 or exists (
    select 1 from public.community_nudges
    where sender_id = v_me and recipient_id = v_target and created_at >= now() - interval '12 hours'
  ) then raise exception 'nudge_rate_limited' using errcode = '42901'; end if;

  insert into public.community_nudges(sender_id, recipient_id, nudge_type, message_key, idempotency_key)
  values(v_me, v_target, p_nudge_type, p_message_key, p_idempotency_key)
  on conflict(idempotency_key) do nothing;
  return jsonb_build_object('queued', true, 'messageKey', p_message_key);
end;
$$;

create or replace function public.community_nudge_inbox(p_limit integer default 30, p_offset integer default 0)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id,
    'nudgeType', n.nudge_type,
    'messageKey', n.message_key,
    'readAt', n.read_at,
    'createdAt', n.created_at,
    'senderPublicId', p.public_id,
    'senderName', p.display_name,
    'senderAvatarPath', p.avatar_path
  ) order by n.created_at desc), '[]'::jsonb)
  from (
    select * from public.community_nudges
    where recipient_id = auth.uid()
    order by created_at desc
    limit least(greatest(p_limit, 1), 50)
    offset greatest(p_offset, 0)
  ) n
  join public.community_profiles p on p.user_id = n.sender_id;
$$;

revoke all on function public.community_create_nudge(uuid, text, text, uuid) from public;
grant execute on function public.community_create_nudge(uuid, text, text, uuid) to authenticated;
revoke all on function public.community_nudge_inbox(integer, integer) from public;
grant execute on function public.community_nudge_inbox(integer, integer) to authenticated;

notify pgrst, 'reload schema';
