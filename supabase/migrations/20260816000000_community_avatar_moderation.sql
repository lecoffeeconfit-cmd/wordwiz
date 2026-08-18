-- Avatar images are now uploaded by the protected Edge Function only after
-- moderation. Authenticated clients retain public read access only.
drop policy if exists "community avatar owner upload" on storage.objects;
drop policy if exists "community avatar owner delete" on storage.objects;

-- Retain the migration history, but prevent the app from setting an avatar by
-- directly uploading an unmoderated storage object.
revoke all on function public.community_set_avatar(text) from public;
revoke all on function public.community_set_avatar(text) from authenticated;

-- A compromised account must not be able to use the moderation endpoint as an
-- unrestricted image-analysis proxy.
create table if not exists public.community_avatar_moderation_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists community_avatar_moderation_attempts_user_created_at_idx
  on public.community_avatar_moderation_attempts (user_id, created_at desc);

alter table public.community_avatar_moderation_attempts enable row level security;

create or replace function public.community_reserve_avatar_moderation(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent_attempts integer;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  -- Serialize checks for one user so concurrent requests cannot bypass the cap.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  delete from public.community_avatar_moderation_attempts
  where created_at < now() - interval '1 day';

  select count(*) into v_recent_attempts
  from public.community_avatar_moderation_attempts
  where user_id = p_user_id
    and created_at >= now() - interval '15 minutes';

  if v_recent_attempts >= 5 then return false; end if;

  insert into public.community_avatar_moderation_attempts (user_id) values (p_user_id);
  return true;
end;
$$;

revoke all on function public.community_reserve_avatar_moderation(uuid) from public;
revoke all on function public.community_reserve_avatar_moderation(uuid) from anon;
revoke all on function public.community_reserve_avatar_moderation(uuid) from authenticated;
grant execute on function public.community_reserve_avatar_moderation(uuid) to service_role;

notify pgrst, 'reload schema';
