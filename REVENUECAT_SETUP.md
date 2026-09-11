# WordWiz Plus launch checklist

## Environment and build

1. Keep `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` set in the EAS development, preview, and production environments. Set `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` to the separate RevenueCat **public Google Play SDK key** in those environments. Do not add a RevenueCat secret key to Expo, Git, or the app.
2. Apply [revenuecat_subscription_migration.sql](supabase/revenuecat_subscription_migration.sql) in the Supabase SQL editor.
3. Generate a random value for `REVENUECAT_WEBHOOK_AUTH`, and store it with `supabase secrets set REVENUECAT_WEBHOOK_AUTH=...`. Also store the RevenueCat **secret** API key only in Supabase Functions as `REVENUECAT_SECRET_API_KEY`; it must never be in Expo, SQL, or Git. Then deploy both functions:
   `supabase functions deploy revenuecat-webhook --no-verify-jwt`
   `supabase functions deploy revenuecat-sync-entitlement`
4. In RevenueCat, configure a webhook pointing to the deployed `revenuecat-webhook` URL and send that same value as its Bearer authorization header.
5. In App Store Connect, confirm In-App Purchase capability, the monthly and annual products, the one-month introductory offer, and the App Store Server Notifications configuration. Keep the RevenueCat `Plus` entitlement and current Offering unchanged.
6. In RevenueCat, add the Google Play app with package `com.lecoffeeconfit.wordwiz`, connect its Google Play service credentials, import the chosen monthly and annual Google Play subscription products, and attach their packages to the existing current Offering and `Plus` entitlement. Product IDs must be chosen in Google Play Console and must not be copied from the iOS products by assumption.
7. Build new native clients because `react-native-purchases` is native code:
   `eas build --profile development --platform ios`
   `eas build --profile development --platform android`
   Install that build for sandbox testing. Expo Go cannot test WordWiz purchases.

## Simulator testing

The iOS Simulator does not retrieve the live App Store catalog. Its plan prices are only available when the app is run from Xcode with a StoreKit Configuration file selected in that scheme; those are local test prices, not launch prices.

1. In Xcode, create a StoreKit Configuration file, sync it with the WordWiz App Store Connect app (or create matching monthly and annual product IDs), and select it in a duplicate WordWiz run scheme.
2. Run that scheme directly from Xcode on an iOS Simulator. `expo run:ios` and other command-line launches do not apply the scheme's StoreKit Configuration file.
3. Export the StoreKit public certificate and upload it to the WordWiz iOS app in RevenueCat. Keep the local product IDs present in the RevenueCat Offering.

Do not hardcode a currency or price in the app. The launch UI always uses StoreKit's localized product price; verify it on a physical device through TestFlight.

## Sandbox and TestFlight checks

- New Apple sandbox tester: choose each plan; Apple’s sheet must show the actual localized price and any eligible introductory offer. Confirm Plus only after RevenueCat reports the `Plus` entitlement active.
- Previously trialed tester: confirm the button does not promise a trial; Apple remains the final eligibility decision.
- Purchase monthly and annual separately, then confirm quizzes unlock and unlimited new-word additions work.
- Cancel, expire, and simulate a billing issue. Confirm existing words and flashcards remain available while quizzes are paywalled.
- Reinstall, sign in, and use Restore Purchases. Verify both the restored and no-active-purchase messages.
- Switch between two WordWiz accounts on the same device and verify Plus status never carries over from one account to the other.
- As a free user, add 10 words in the same UTC calendar month; the 11th must open the Plus paywall. Editing or deleting a word must not change that count. Verify the next calendar month starts with a fresh allowance.
- Repeat the purchase, restore, expiration, and account-switching checks in TestFlight before submitting for review.

This implementation deliberately does not claim that live purchases work until those Apple sandbox and TestFlight checks are completed.

## Google Play checks

- Upload an EAS production `.aab` to an internal testing track, then add licensed test accounts in Google Play Console.
- Confirm the current Offering returns localized monthly and annual Google Play prices and both packages grant the exact `Plus` entitlement.
- Test purchase, cancellation, restore, expiration, billing failure, app backgrounding for payment verification, reinstall, and switching between two WordWiz accounts.
- Confirm Manage Subscription opens the Google Play subscription destination and deleting an account clearly leaves store subscription cancellation under the learner's control.

Android purchases remain intentionally unavailable when `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` is not configured or when the app is running in Expo Go.
