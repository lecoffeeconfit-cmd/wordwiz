# WordWiz Plus launch checklist

## Environment and build

1. Keep `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` set in the EAS development, preview, and production environments. It must be the RevenueCat **public iOS SDK key** already used by WordWiz; do not add a RevenueCat secret key to Expo, Git, or the app.
2. Apply [revenuecat_subscription_migration.sql](supabase/revenuecat_subscription_migration.sql) in the Supabase SQL editor.
3. Generate a random value for `REVENUECAT_WEBHOOK_AUTH`, and store it with `supabase secrets set REVENUECAT_WEBHOOK_AUTH=...`. Also store the RevenueCat **secret** API key only in Supabase Functions as `REVENUECAT_SECRET_API_KEY`; it must never be in Expo, SQL, or Git. Then deploy both functions:
   `supabase functions deploy revenuecat-webhook --no-verify-jwt`
   `supabase functions deploy revenuecat-sync-entitlement`
4. In RevenueCat, configure a webhook pointing to the deployed `revenuecat-webhook` URL and send that same value as its Bearer authorization header.
5. In App Store Connect, confirm In-App Purchase capability, the monthly and annual products, the one-month introductory offer, and the App Store Server Notifications configuration. Keep the RevenueCat `plus` entitlement and current Offering unchanged.
6. Build a new native client because `react-native-purchases` is native code:
   `eas build --profile development --platform ios`
   Install that build for sandbox testing. Expo Go cannot test WordWiz purchases.

## Sandbox and TestFlight checks

- New Apple sandbox tester: choose each plan; Apple’s sheet must show the actual localized price and any eligible introductory offer. Confirm Plus only after RevenueCat reports the `plus` entitlement active.
- Previously trialed tester: confirm the button does not promise a trial; Apple remains the final eligibility decision.
- Purchase monthly and annual separately, then confirm quizzes unlock and unlimited new-word additions work.
- Cancel, expire, and simulate a billing issue. Confirm existing words and flashcards remain available while quizzes are paywalled.
- Reinstall, sign in, and use Restore Purchases. Verify both the restored and no-active-purchase messages.
- Switch between two WordWiz accounts on the same device and verify Plus status never carries over from one account to the other.
- As a free user, add 10 words in the same UTC calendar month; the 11th must open the Plus paywall. Editing or deleting a word must not change that count. Verify the next calendar month starts with a fresh allowance.
- Repeat the purchase, restore, expiration, and account-switching checks in TestFlight before submitting for review.

This implementation deliberately does not claim that live purchases work until those Apple sandbox and TestFlight checks are completed.
