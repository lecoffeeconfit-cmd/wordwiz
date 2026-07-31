-- The Edge Function owns the curated message catalogue. Keep the database
-- forward-compatible with new keys while limiting direct RPC callers to safe
-- identifier-shaped keys; unknown legacy keys render as a safe category fallback.
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
  if p_message_key !~ '^[a-z0-9_]{1,64}$' then raise exception 'invalid_nudge_message' using errcode = '22023'; end if;

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

revoke all on function public.community_create_nudge(uuid, text, text, uuid) from public;
grant execute on function public.community_create_nudge(uuid, text, text, uuid) to authenticated;
notify pgrst, 'reload schema';
