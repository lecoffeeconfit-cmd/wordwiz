-- The prior regular expression double-escaped the image extension, which
-- could reject a valid uploaded avatar path before it was saved to a profile.
create or replace function public.community_set_avatar(p_path text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_path !~ ('^' || v_user::text || '/avatar-[0-9]+[.]jpg$') then
    raise exception 'invalid_avatar_path' using errcode = '22023';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'community-avatars'
      and name = p_path
      and owner = v_user
  ) then
    raise exception 'avatar_not_uploaded' using errcode = '22023';
  end if;

  update public.community_profiles
  set avatar_path = p_path,
      avatar_updated_at = now(),
      updated_at = now()
  where user_id = v_user;
  if not found then
    raise exception 'community_profile_required' using errcode = '22023';
  end if;
  return p_path;
end;
$$;

revoke all on function public.community_set_avatar(text) from public;
grant execute on function public.community_set_avatar(text) to authenticated;
notify pgrst, 'reload schema';
