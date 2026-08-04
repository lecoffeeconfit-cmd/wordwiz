-- A declined request should not permanently prevent the same two learners from
-- reconnecting. Reuse the unique pair row for a new pending request.
create or replace function public.community_send_friend_request(p_friend_code text)
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
  where friend_code = upper(trim(p_friend_code)) and friend_requests_enabled;
  if v_target is null then raise exception 'friend_code_not_available' using errcode = '22023'; end if;
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
    set requester_id = v_me,
        recipient_id = v_target,
        status = 'pending',
        created_at = now(),
        responded_at = null
    where id = v_existing_id;
    return;
  end if;
  if v_existing_id is not null then raise exception 'friend_request_already_exists' using errcode = '23505'; end if;

  insert into public.community_friendships(requester_id, recipient_id)
  values (v_me, v_target);
exception when unique_violation then
  raise exception 'friend_request_already_exists' using errcode = '23505';
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
  where public_id = p_public_id and friend_requests_enabled;
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
    set requester_id = v_me,
        recipient_id = v_target,
        status = 'pending',
        created_at = now(),
        responded_at = null
    where id = v_existing_id;
    return;
  end if;
  if v_existing_id is not null then raise exception 'friend_request_already_exists' using errcode = '23505'; end if;

  insert into public.community_friendships(requester_id, recipient_id)
  values (v_me, v_target);
exception when unique_violation then
  raise exception 'friend_request_already_exists' using errcode = '23505';
end;
$$;

revoke all on function public.community_send_friend_request(text), public.community_send_friend_request_by_public_id(uuid) from public;
grant execute on function public.community_send_friend_request(text), public.community_send_friend_request_by_public_id(uuid) to authenticated;

notify pgrst, 'reload schema';
