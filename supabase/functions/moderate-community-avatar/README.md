# Community avatar moderation

This protected function accepts any normal image type the phone's picker
supports. The app crops, resizes, and converts it to a JPEG before the image is
screened and saved, so storage and moderation have one safe, predictable format.

## Required secret

In Supabase, open your project, then **Edge Functions → Secrets → Add new
secret** and add:

```text
OPENAI_API_KEY = your OpenAI service-account key
```

Do not put this value in the Expo app, a committed `.env` file, or any
client-side Supabase setting. Keep JWT verification enabled for this function.

## Deploy

After applying the database migration, deploy the function:

```bash
npx supabase functions deploy moderate-community-avatar
```
