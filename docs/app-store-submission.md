# WordWiz App Store subscription metadata

This is the source of truth for the App Store Connect fields related to
WordWiz Plus auto-renewable subscriptions. App code cannot update App Store
Connect metadata, so complete the checklist below before submitting a new
build.

## App Information

Set the App Store Connect **Privacy Policy URL** field to:

https://lecoffeeconfit-cmd.github.io/wordwiz-legal/

Leave the **License Agreement** field without a custom agreement so Apple's
standard EULA applies. Also include the functional standard-EULA link in the
app description as shown below:

https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

The WordWiz app's Terms of Use link opens the published WordWiz terms page:

https://lecoffeeconfit-cmd.github.io/wordwiz-legal/terms.html

Both published WordWiz legal URLs were verified as reachable with HTTP 200 on
September 4, 2026.

## App Description

Append this section to the current App Store description. Keep the URLs as
plain text so App Store Connect renders them as functional links:

```text
Subscriptions

WordWiz Plus Monthly is an auto-renewable 1-month subscription. WordWiz Plus Annual is an auto-renewable 1-year subscription. The price shown in the app is the current App Store price for your region. Payment is charged to your Apple ID. Subscriptions renew automatically unless canceled at least 24 hours before the end of the current period. Manage or cancel subscriptions in your Apple ID account settings.

Terms of Use (Apple Standard EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy Policy: https://lecoffeeconfit-cmd.github.io/wordwiz-legal/
```

## App Review Information notes

Paste the following into the App Review Information **Notes** field and
replace the bracketed sign-in details with the review account already used for
WordWiz:

```text
WordWiz Plus subscriptions are available from Stats > Your WordWiz access.

To review the subscription flow:
1. Sign in with the provided review account: [email] / [password].
2. Open Stats and scroll to the Your WordWiz access card.
3. Tap Upgrade to Plus or View Plans.
4. The paywall shows WordWiz Plus Annual (1-year subscription) and WordWiz Plus Monthly (1-month subscription), with the live localized Apple price for each plan.
5. The paywall also shows automatic-renewal terms, Restore Purchases, Terms of Use, and Privacy Policy. Terms and Privacy links open in the browser.

Purchases use Apple's in-app purchase flow through RevenueCat. Please use a Sandbox/TestFlight Apple ID when testing a purchase. Existing subscribers can use Manage Subscription to open Apple's subscription management screen.
```

## Final pre-submit checklist

- [ ] The Privacy Policy URL field contains the WordWiz privacy URL above.
- [ ] No custom License Agreement is entered unless you intentionally maintain
      one; Apple's standard EULA applies by default.
- [ ] The standard EULA link is present in the App Description above.
- [ ] The subscription section is present in the App Description and both
      links open successfully from App Store Connect's preview.
- [ ] The submitted build includes the paywall with plan title, price,
      duration, automatic-renewal language, Terms of Use, and Privacy Policy.
- [ ] App Review Information includes working credentials and the review
      notes above.
