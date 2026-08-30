-- Return the friendship timestamp so Friends can show when each connection was added.

create or replace function public.community_connections()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', f.id,
        'status', f.status,
        'direction', case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
        'publicId', p.public_id,
        'displayName', p.display_name,
        'avatarPath', p.avatar_path,
        'isMuted', exists(
          select 1
          from public.community_mutes m
          where m.user_id = auth.uid()
            and m.muted_user_id = p.user_id
        ),
        'addedAt', case
          when f.status = 'accepted' then coalesce(f.responded_at, f.created_at)
          else f.created_at
        end
      )
      order by f.created_at desc
    ),
    '[]'::jsonb
  )
  from public.community_friendships f
  join public.community_profiles p
    on p.user_id = case
      when f.requester_id = auth.uid() then f.recipient_id
      else f.requester_id
    end
  where auth.uid() in (f.requester_id, f.recipient_id)
    and f.status in ('pending', 'accepted');
$$;

notify pgrst, 'reload schema';
