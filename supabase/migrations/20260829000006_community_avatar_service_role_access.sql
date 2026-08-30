-- The avatar moderation Edge Function reads and updates the owner's profile
-- with its server-side service_role client. RLS bypass does not replace table
-- privileges, so grant only the operations that function needs.
grant select, update on table public.community_profiles to service_role;

notify pgrst, 'reload schema';
