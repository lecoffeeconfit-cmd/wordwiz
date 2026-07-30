# WordWiz admin dashboard function

Apply `supabase/admin_dashboard_migration.sql` in the Supabase SQL Editor, then deploy:

```sh
supabase functions deploy admin-dashboard
```

The function uses the project-managed `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` secrets. Do not put the service-role key in Expo
environment variables or in the app.
