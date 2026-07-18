# RevenueCat entitlement sync

Deploy with `supabase functions deploy revenuecat-sync-entitlement`. Set `REVENUECAT_SECRET_API_KEY` only as a Supabase Function secret. The app never receives this value.

The function authenticates the current Supabase user, queries that same UUID in RevenueCat, and writes only the resulting `Plus` entitlement status to the server-side cache. WordWiz invokes it after a successful purchase or restore so the free-word RPC recognizes Plus immediately; webhooks continue to keep the cache current thereafter.
