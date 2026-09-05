-- Account deletion cleanup also removes user-associated admin audit rows. These
-- rows intentionally have no auth.users foreign key, so grant the server-only
-- deletion functions the one explicit mutation they need.
grant delete on table public.admin_audit_log to service_role;
