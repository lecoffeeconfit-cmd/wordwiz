-- Optional Community avatars. Paths are scoped to the authenticated user's
-- UUID, while the bucket is public only so leaderboard images can render.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', true, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg'];

create policy "community avatars public read"
on storage.objects for select
using (bucket_id = 'community-avatars');

create policy "community avatar owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'community-avatars'
  and owner = auth.uid()
  and name like auth.uid()::text || '/%'
);

create policy "community avatar owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'community-avatars'
  and owner = auth.uid()
  and name like auth.uid()::text || '/%'
);

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
  if p_path !~ ('^' || v_user::text || '/avatar-[0-9]+\\.jpg$') then
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
