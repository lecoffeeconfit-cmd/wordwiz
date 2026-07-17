# RevenueCat webhook

Deploy with `supabase functions deploy revenuecat-webhook --no-verify-jwt` and set a random `REVENUECAT_WEBHOOK_AUTH` Supabase secret. Configure the same value as a Bearer authorization header in RevenueCat's webhook settings.

This function only accepts WordWiz Supabase UUID App User IDs and updates the server-side entitlement cache used by the word-addition RPC. It does not contain or require a RevenueCat secret API key.
