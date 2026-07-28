import * as Sentry from '@sentry/react-native';
import { env } from '../config/env';
import type { AuthUser } from '../types';
import { configureErrorReporting, type ErrorContext } from './errorReporting';

let sentryInitialized = false;

export function initializeSentry() {
  if (!env.sentryDsn || sentryInitialized) {
    return;
  }

  try {
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.appEnvironment,
      enabled: !__DEV__,
      enableAutoSessionTracking: true,
      tracesSampleRate: __DEV__ ? 1 : 0.1,
    });

    configureErrorReporting({
      captureException: (error, context) => {
        Sentry.withScope((scope) => {
          applyContext(scope, context);
          Sentry.captureException(error);
        });
      },
      captureMessage: (message, context) => {
        Sentry.withScope((scope) => {
          applyContext(scope, context);
          Sentry.captureMessage(message);
        });
      },
    });

    sentryInitialized = true;
  } catch (error) {
    // Telemetry must never prevent WordWiz from launching.
    configureErrorReporting(null);
    if (__DEV__) {
      console.warn('[sentry] initialization failed', error);
    }
  }
}

export function setSentryUser(user: AuthUser | null) {
  if (!sentryInitialized) {
    return;
  }

  Sentry.setUser(
    user
      ? {
          id: user.id,
        }
      : null,
  );
}

export function wrapWithSentry<T>(component: T): T {
  try {
    return Sentry.wrap(component as never) as T;
  } catch (error) {
    // Fall back to the unwrapped app if instrumentation is unavailable.
    if (__DEV__) {
      console.warn('[sentry] app wrapper failed', error);
    }
    return component;
  }
}

function applyContext(
  scope: Sentry.Scope,
  context: ErrorContext | undefined,
) {
  if (!context) {
    return;
  }

  Object.entries(context).forEach(([key, value]) => {
    if (value !== undefined) {
      scope.setTag(key, String(value));
    }
  });
}
