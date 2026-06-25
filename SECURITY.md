# WordWiz Security Notes

## Client-visible values

Expo replaces `process.env.EXPO_PUBLIC_*` values into the JavaScript bundle.
Anything with this prefix can be viewed by someone inspecting the app.

Safe client values:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

The Supabase anon key is not a private secret. It is intended to be used in
browser/mobile clients together with Row Level Security policies.

## Server-only secrets

Never put these in `EXPO_PUBLIC_*`, `app.json`, or client code:

- `SUPABASE_SERVICE_ROLE_KEY`
- OpenAI API keys
- paid dictionary API keys
- OAuth client secrets
- SMTP/API provider secrets

Server-only secrets belong in Supabase Edge Functions or another backend. The
delete-account flow follows this pattern: the app calls an Edge Function, and
the function uses the service-role key server-side.

## Production checklist

- Keep `.env.local` uncommitted.
- Keep Row Level Security enabled on all user data tables.
- Confirm every table policy restricts access with `auth.uid() = user_id`.
- Use Supabase Edge Functions for any feature that needs a private key.
- Rotate any key that was accidentally pasted into client code or committed.
