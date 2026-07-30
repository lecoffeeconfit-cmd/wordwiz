# Admin dashboard setup

1. In Supabase **SQL Editor**, run `admin_dashboard_migration.sql`. If you
   already installed the Admin Center, run the revised migration again; its
   statements are safe to reapply and add the time-insights tables/RPC.
2. Create or sign in to the WordWiz account that should be an admin, then run
   this SQL with its email address:

   ```sql
   insert into public.app_admins (user_id)
   select id
   from auth.users
   where lower(email) = lower('you@example.com')
   on conflict (user_id) do nothing;
   ```

3. Deploy the protected function:

   ```sh
   supabase functions deploy admin-dashboard
   ```

4. Fully close and reopen WordWiz (or sign out and back in). The account card
   on Stats will show **Open admin center** only for that account.

To remove admin access later:

```sql
delete from public.app_admins
where user_id = (select id from auth.users where lower(email) = lower('you@example.com'));
```

Never add a service-role key to the mobile app. The deployed Edge Function
uses Supabase-managed server secrets to perform every privileged action.
