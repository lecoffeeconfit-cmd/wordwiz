# delete-account Edge Function

This function deletes the signed-in Supabase Auth user and is the production
account-deletion path for every signed-in WordWiz learner, including admins who
delete their own account. It must run on Supabase, not inside the Expo app,
because `auth.admin.deleteUser` requires the `SUPABASE_SERVICE_ROLE_KEY`.

Before Auth is removed, it:

- verifies the caller's JWT and derives the user ID from that JWT;
- revokes a supplied Sign in with Apple token through Apple's revoke endpoint;
- removes all objects under the user ID in `community-avatars` and
  `feedback-screenshots` (including older uploads);
- removes user-associated rows from `admin_audit_log`; and
- deletes the Auth record, allowing the `auth.users` foreign-key cascades to
  remove the user's database rows.

The database tables linked to `auth.users` use `on delete cascade`, including
learning data, quiz/review history, subscriptions and complimentary access,
Community profiles/relationships/reports/push tokens, word collectors,
feedback, screen-time sessions, and admin membership. Aggregate reporting
tables contain no user ID and are intentionally retained as aggregate data.

Deploy after installing/logging into the Supabase CLI:

```bash
supabase functions deploy apple-token-exchange
supabase functions deploy delete-account
```

Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions automatically.

For native Sign in with Apple authorization-code exchange and token revocation,
set these server-only secrets using the same Apple client ID used by the
Supabase Apple provider:

```bash
supabase secrets set APPLE_CLIENT_ID=com.lecoffeeconfit.wordwiz APPLE_CLIENT_SECRET='your-server-generated-apple-client-secret-jwt'
```

`APPLE_CLIENT_SECRET` must be the server-generated Apple client-secret JWT,
not the app's Supabase anon key. If these two secrets are not configured, the
WordWiz account is still deleted, and the app tells an Apple-sign-in learner to
revoke WordWiz manually in Apple Account settings. If a token is supplied but
Apple rejects it, the WordWiz account is kept intact so the learner can retry.

Apply the account-deletion migration before deploying the function so the
server-only role can remove the otherwise-unlinked audit rows:

```bash
supabase db push
```

The existing admin-dashboard function uses the same cleanup helper, so admin
deletion also removes user-owned uploads and audit rows before deleting Auth.

Do not add the service-role key to `.env.local`, `app.json`, or any Expo client
file.
