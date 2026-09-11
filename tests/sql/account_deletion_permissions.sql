-- Run with a privileged database connection after applying migrations:
-- supabase db query --linked --file tests/sql/account_deletion_permissions.sql
-- All fixtures and mutations are rolled back; existing users are never used.
begin;

create temporary table deletion_permission_fixture on commit drop as
select gen_random_uuid() as deleting_user, gen_random_uuid() as other_user;
grant select on deletion_permission_fixture to service_role;

insert into public.admin_audit_log (admin_user_id, target_user_id, action)
select deleting_user, other_user, 'delete_user' from deletion_permission_fixture
union all
select other_user, deleting_user, 'delete_user' from deletion_permission_fixture
union all
select other_user, other_user, 'delete_user' from deletion_permission_fixture;

set local role service_role;
-- Exercise the same OR filter as the Edge Function, under its actual DB role.
delete from public.admin_audit_log
where admin_user_id = (select deleting_user from deletion_permission_fixture)
   or target_user_id = (select deleting_user from deletion_permission_fixture);
-- A second pass must also succeed when there are no matching audit records.
delete from public.admin_audit_log
where admin_user_id = (select deleting_user from deletion_permission_fixture)
   or target_user_id = (select deleting_user from deletion_permission_fixture);
reset role;

do $$
begin
  if exists (
    select 1 from public.admin_audit_log a, deletion_permission_fixture f
    where a.admin_user_id = f.deleting_user or a.target_user_id = f.deleting_user
  ) then
    raise exception 'Account deletion left matching audit records behind';
  end if;
  if (select count(*) from public.admin_audit_log a, deletion_permission_fixture f
      where a.admin_user_id = f.other_user and a.target_user_id = f.other_user) <> 1 then
    raise exception 'Account deletion affected another user audit record';
  end if;
  if has_any_column_privilege('anon', 'public.admin_audit_log', 'SELECT')
     or has_any_column_privilege('authenticated', 'public.admin_audit_log', 'SELECT')
     or has_table_privilege('anon', 'public.admin_audit_log', 'DELETE')
     or has_table_privilege('authenticated', 'public.admin_audit_log', 'DELETE') then
    raise exception 'Audit cleanup permissions must remain server-only';
  end if;
end;
$$;

rollback;
select 'Account deletion permissions and user isolation passed' as result;
