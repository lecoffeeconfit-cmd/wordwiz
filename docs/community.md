# WordWiz Community

Community is an opt-in learning feature. It adds a sixth bottom-tab destination without changing words, collections, quizzes, flashcards, subscriptions, or the existing WordWiz mastery system.

## Learner privacy

- A learner must create a Community profile before appearing anywhere public.
- A display name, optional avatar path, friend code, and Social XP are the only profile values intended for Community surfaces.
- Definitions, examples, saved words, quiz answers, email addresses, and private learning history are never returned by the Community RPCs.
- Leaderboards include only profiles that explicitly enable leaderboard visibility.
- Friend requests require an exact eight-character code; there is no user search or contact import.
- Blocks, mutes, report records, friend-only nudges, and server-side limits are enforced in database functions, not only in the app UI.
- Profile pictures are optional. WordWiz crops and resizes a selected image to a 512px JPEG before upload; Storage accepts only JPEG files up to 2 MB, scoped to the uploader's account. Avatar images are public only so they can be displayed beside the public display name a learner chose to share.

## Social XP

Social XP is separate from WordWiz mastery, achievements, levels, and subscription access.

- A completed quiz attempt earns `score × 5` Social XP.
- Each flashcard review earns 2 XP when remembered and 1 XP otherwise.
- A one-time historical baseline is all-time only. It never appears in daily or weekly rankings.
- New events are recorded with idempotency keys by database triggers, so retries do not create duplicate XP.

## Push notifications

The Community tab requests notification permission only when a learner turns on **Push nudges**. Permission is not requested on launch or during sign-in.

Before shipping real device push notifications:

1. Configure APNs credentials in the Expo/EAS project for iOS and FCM credentials for Android, following the [Expo SDK 56 notifications guide](https://docs.expo.dev/versions/v56.0.0/sdk/notifications/).
2. If Expo Push Security is enabled, add `EXPO_ACCESS_TOKEN` as a Supabase Edge Function secret. Do not add this secret to the Expo app or any `EXPO_PUBLIC_*` variable.
3. Build a new native development/TestFlight build; Expo push tokens cannot be verified in a simulator or Expo Go.
4. Test on two real accounts/devices: friend request, accept, in-app nudge, background push, notification tap, mute, block, and logout/login token deactivation.

## Profile pictures

The avatar picker uses Expo ImagePicker and Expo ImageManipulator from the SDK 56-compatible versions. Because ImagePicker provides the iOS photo-library permission text through its config plugin, create a new native build before testing it on TestFlight. No direct `Info.plist` edit is needed.

`send-study-nudge` creates the durable in-app inbox item through the caller-scoped RPC before it attempts Expo delivery. A missing token or unavailable push provider therefore never discards the nudge.

## Deployment

The Community schema migration and `send-study-nudge` Edge Function are deployed with:

```sh
npx supabase db push
npx supabase functions deploy send-study-nudge
```

After any notification configuration change, create a fresh native build. No subscription, billing, bundle identifier, version, or signing configuration changes are required by the Community code.

## Operations

- `community_push_tokens` stays inaccessible to mobile clients through RLS.
- The Admin Center shows aggregate Community health for the selected reporting period: opted-in profiles, friend connections, nudges sent, unique nudge senders, unread nudges, active push tokens, pending requests, and open reports. It never displays nudge text, learner email addresses, private study data, or notification tokens.
- Admins can restrict a Community profile (removes it from rankings and disables new Community interactions), lift that restriction without republishing it, and resolve reports. Learners retain control over whether to opt back into public Community features.
- Expo receipts are not yet persisted in this initial release. Monitor Expo’s Push Notifications Tool while traffic is low; before large-scale campaigns, add a scheduled receipt worker that disables `DeviceNotRegistered` tokens.
- Community is intentionally non-blocking. If its RPCs are unavailable, startup, WordWiz learning, and every existing tab remain usable.
