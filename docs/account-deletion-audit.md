# WordWiz account-deletion audit

The in-app path is available to every authenticated learner from the bottom of
Stats/Profile & Settings. It is not gated by `isAdmin`. The destructive action
uses a clear confirmation, explains the irreversible effect and separate Apple
subscription management, disables duplicate taps while running, and retains
the session when the authenticated deletion request fails.

## Production deletion path

Client files:

- `src/screens/DashboardScreen.tsx` — bottom danger-zone UI and accessibility.
- `src/application/AppContent.tsx` — confirmation, server request, RevenueCat
  logout, Auth cleanup, and local cache reset.
- `src/services/auth.ts` — authenticated Edge Function call and secure storage
  of one-time OAuth provider tokens.

Server files:

- `supabase/functions/delete-account/index.ts` — verifies the caller JWT,
  optionally revokes Apple access, runs cleanup, then calls
  `auth.admin.deleteUser(user.id, false)`.
- `supabase/functions/_shared/accountDeletion.ts` — removes user-owned
  Storage objects and unlinked audit rows.
- `supabase/functions/admin-dashboard/index.ts` — uses the same cleanup for
  authorized admin-initiated deletion.
- `supabase/migrations/20260904000000_account_deletion_hardening.sql` — grants
  the server-only role permission to remove user-associated audit rows.

## Data coverage

Deleting the Auth record cascades through these user-linked tables:

`words`, `quiz_attempts`, `card_reviews`, `reminder_settings`,
`word_addition_usage`, `subscription_entitlements`, `complimentary_access`,
`screen_time_sessions`, `app_admins`, `community_profiles`,
`community_xp_ledger`, `community_friendships`, `community_blocks`,
`community_mutes`, `community_nudges`, `community_push_tokens`,
`community_reports`, `community_avatar_moderation_attempts`,
`word_collector_entries`, `word_collector_regions`,
`community_daily_learning_goals`, `feedback_reports`, and
`feedback_messages`.

The function explicitly removes rows from `admin_audit_log` where the deleted
user was the actor or target because that table intentionally has no Auth
foreign key. It also removes every object under the user-ID prefix from the
`community-avatars` and `feedback-screenshots` Storage buckets, including old
uploads that are no longer referenced by a profile or feedback row.

Aggregate-only reporting tables such as `screen_time_daily`,
`analytics_retention_jobs`, and `stats_section_daily` contain no user ID and
are retained as aggregate data.

## Sign in with Apple and subscriptions

On iOS, WordWiz uses Apple's native authorization sheet and exchanges the
identity token with Supabase using a cryptographically random nonce. Apple
returns the full name and email only on the first authorization, so missing
values on later sign-ins are expected and do not block login.

Supabase provider tokens are captured when browser OAuth returns them and stored
only in iOS Keychain-backed SecureStore. Native Apple sign-in also sends its
one-time authorization code over the authenticated Supabase session to the
`apple-token-exchange` Edge Function. That server-only exchange uses
`APPLE_CLIENT_ID` and `APPLE_CLIENT_SECRET`, then returns only Apple's refresh
token for Keychain-backed storage. During deletion, the refresh token is sent
over TLS to the server first when available, and the server calls Apple's revoke
endpoint. If the exchange function is unavailable or no revocable token is
available, the account is still deleted and the app tells the learner to revoke
WordWiz manually in Apple Account settings. If Apple rejects a supplied token,
the WordWiz account is still deleted and the app gives the same
manual-revocation instruction so an Apple-service error cannot block account
deletion.

Deleting a WordWiz account does not cancel an App Store subscription. RevenueCat
is logged out locally, while the learner is directed to Apple subscription
settings to manage or cancel billing separately.

## Production setup

From the Supabase project directory, after confirming the project ref:

```bash
supabase db push
supabase secrets set APPLE_CLIENT_ID=com.lecoffeeconfit.wordwiz APPLE_CLIENT_SECRET='your-server-generated-apple-client-secret-jwt'
supabase functions deploy apple-token-exchange
supabase functions deploy delete-account
supabase functions deploy admin-dashboard
```

The Apple secret must be the server-generated client-secret JWT for the Apple
client ID used by the Supabase Apple provider. Never put it in Expo public
environment variables or the app bundle.

## App Review verification

Use a disposable signed-in test account. Add a word, complete a quiz, create a
Connect profile, upload an avatar, and submit feedback with a screenshot. Open
Stats, scroll to the bottom, choose Delete account, and record the confirmation
and successful return to the signed-out screen. Verify the account cannot sign
in again, its profile no longer appears in Connect, and the Storage prefixes
are empty. For an Apple-sign-in test, also verify the success message accurately
states whether Apple revocation was completed or manual revocation is needed.

Run the local checks before submitting:

```bash
npm run typecheck
npm test
git diff --check
```
