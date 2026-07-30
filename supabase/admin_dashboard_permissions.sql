-- Production permissions for the server-only admin dashboard function.
-- service_role bypasses RLS but still needs explicit Postgres table grants for
-- tables whose default privileges were tightened by earlier migrations.

grant usage on schema public to service_role;

grant select on table
  public.app_admins,
  public.words,
  public.quiz_attempts,
  public.card_reviews,
  public.subscription_entitlements,
  public.reminder_settings
to service_role;

grant select, insert, update on table
  public.word_addition_usage,
  public.complimentary_access
to service_role;

grant insert on table public.admin_audit_log to service_role;
