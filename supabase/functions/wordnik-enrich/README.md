# Wordnik enrichment Edge Function

This function is an optional proxy for Wordnik lookups. Store the API key as a
Supabase secret named `WORDNIK_API_KEY`; never put it in `EXPO_PUBLIC_*` app
environment variables.

Deploy after setting the secret:

```sh
supabase secrets set WORDNIK_API_KEY=your-wordnik-key
supabase functions deploy wordnik-enrich
```

The function requires a signed-in Supabase user, applies short request timeouts,
and returns safe fallback reasons instead of blocking word saves. It normalizes
selected display fields only and does not store raw Wordnik responses. Wordnik's
API terms restrict caching; keep any caching session-scoped unless your Wordnik
plan and terms explicitly allow more.

Wordnik data that is displayed must include required attribution. The function
passes definition attribution text and the Wordnik word URL back to the app for
that purpose.
