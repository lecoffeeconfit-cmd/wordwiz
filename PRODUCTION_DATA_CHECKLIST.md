# WordWiz Production Data Checklist

Use this checklist to confirm users, words, quizzes, reviews, and reminders are
production-ready in Supabase.

## Supabase setup

1. Run `supabase/wordwiz_schema.sql` in the Supabase SQL editor.
2. Run `supabase/production_verification.sql` and confirm:
   - all WordWiz tables have RLS enabled
   - policies use `auth.uid() = user_id`
   - no broad public table policies exist
3. Deploy the delete-account Edge Function:

```bash
supabase functions deploy delete-account
```

4. In Supabase Auth settings:
   - keep email confirmation enabled
   - configure the production site URL
   - add local and production redirect URLs
   - configure Google, Apple, and Microsoft providers if using social login

## Manual user isolation test

1. Create and verify `user-a`.
2. Add a word, finish one flashcard review, and complete a quiz.
3. Log out.
4. Create and verify `user-b`.
5. Confirm `user-b` does not see `user-a` words, quizzes, reviews, or reminders.
6. Add separate data for `user-b`.
7. Log back into `user-a` and confirm only `user-a` data appears.

## Current app behavior

- Supabase Auth stores users.
- Supabase tables store cloud learning data after schema setup.
- AsyncStorage is now a per-user local cache, not a global shared cache.
- Signed-out state uses starter/demo words only.
- If cloud sync fails, the app keeps changes in the signed-in user's local cache
  and warns that Supabase setup needs attention.

## Not yet covered by code

- True offline conflict resolution across multiple devices.
- Automated Supabase integration tests.
- Production monitoring/crash reporting.
