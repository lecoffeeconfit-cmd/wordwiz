# delete-account Edge Function

This function deletes the signed-in Supabase Auth user. It must run on Supabase,
not inside the Expo app, because `auth.admin.deleteUser` requires the
`SUPABASE_SERVICE_ROLE_KEY`.

Deploy after installing/logging into the Supabase CLI:

```bash
supabase functions deploy delete-account
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions automatically.

Do not add the service-role key to `.env.local`, `app.json`, or any Expo client
file.
