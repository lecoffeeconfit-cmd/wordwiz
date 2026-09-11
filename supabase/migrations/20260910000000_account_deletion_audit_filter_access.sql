-- DELETE also needs SELECT on the columns used in its WHERE filter. Without
-- these grants, cleanupUserOwnedData fails with 42501 even when the user has
-- no audit records, blocking every authenticated account-deletion request.
-- Only the trusted server role receives access to the two filter columns.
grant select (admin_user_id, target_user_id)
  on table public.admin_audit_log to service_role;
