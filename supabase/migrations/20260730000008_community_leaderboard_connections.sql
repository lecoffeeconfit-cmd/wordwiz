-- Lets a signed-in learner send a friend request from a public leaderboard
-- profile. The target's private friend code is never exposed.
create or replace function public.community_send_friend_request_by_public_id(p_public_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_target uuid;
begin
  if v_me is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select user_id into v_target
  from public.community_profiles
  where public_id = p_public_id and friend_requests_enabled;
  if v_target is null then raise exception 'friend_request_not_available' using errcode = '22023'; end if;
  if v_target = v_me then raise exception 'cannot_add_yourself' using errcode = '22023'; end if;
  if exists (
    select 1 from public.community_blocks
    where (blocker_id = v_me and blocked_id = v_target)
       or (blocker_id = v_target and blocked_id = v_me)
  ) then raise exception 'relationship_unavailable' using errcode = '42501'; end if;
  insert into public.community_friendships(requester_id, recipient_id) values(v_me, v_target);
exception when unique_violation then raise exception 'friend_request_already_exists' using errcode = '23505'; end;
$$;

revoke all on function public.community_send_friend_request_by_public_id(uuid) from public;
grant execute on function public.community_send_friend_request_by_public_id(uuid) to authenticated;
