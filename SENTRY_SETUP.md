# WordWiz Sentry Setup

WordWiz has app-side Sentry wiring, but it stays disabled until a DSN is
configured.

## Required for runtime crash/error reporting

Create a Sentry React Native project, then set this public EAS environment
variable:

```bash
EXPO_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

The DSN is safe to expose in the app bundle. Do not use `EXPO_PUBLIC_` for
private Sentry auth tokens.

## Recommended for production source maps

Create a Sentry organization auth token with release/source-map upload
permissions, then store it as a sensitive EAS secret:

```bash
SENTRY_AUTH_TOKEN=your-private-token
```

Also keep your Sentry organization slug and project slug available in the Sentry
dashboard for EAS/Sentry configuration.

Source-map upload is currently disabled in `eas.json` with:

```bash
SENTRY_DISABLE_AUTO_UPLOAD=true
```

This keeps App Store/TestFlight builds from failing before Sentry org/project
settings are configured. When you are ready to upload source maps, remove that
environment variable from the EAS build profile and configure:

```bash
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=your-private-token
```

## Verification

After adding the DSN, make a release or TestFlight build and confirm:

1. App launches normally.
2. A captured test error appears in Sentry.
3. Source maps are uploaded during EAS builds when `SENTRY_AUTH_TOKEN` is set.

The app's internal `reportError` and `reportMessage` helpers will send events to
Sentry when configured and remain no-op safe when it is not configured.
