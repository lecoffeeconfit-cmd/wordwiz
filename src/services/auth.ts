import type { AuthUser, StoredUser } from '../types';
import { supabase } from './supabase';
import * as SecureStore from 'expo-secure-store';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import type { Provider, Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { reportError } from './errorReporting';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 60;
const MAX_EMAIL_LENGTH = 120;
const MAX_PASSWORD_LENGTH = 128;
const AUTH_REQUEST_LOGS_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_WORDWIZ_EGRESS_LOGS === 'true';

type AuthRequestContext = {
  screen: string;
  reason: string;
};

export type StoredAppleProviderTokens = {
  appleProvider: boolean;
  appleProviderToken: string | null;
  appleProviderRefreshToken: string | null;
};

export type AccountDeletionResult = {
  deleted: true;
  appleRevocation: 'revoked' | 'manual_required' | 'not_applicable';
};

const oauthTokenStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const APPLE_PROVIDER_TOKEN_KEY = '@wordwiz/auth/apple-provider-token';
const APPLE_PROVIDER_REFRESH_TOKEN_KEY = '@wordwiz/auth/apple-provider-refresh-token';
const APPLE_PROVIDER_USER_KEY = '@wordwiz/auth/apple-provider-user';

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || cleanEmail.length > MAX_EMAIL_LENGTH) {
    return 'Enter a valid email address.';
  }
  if (!EMAIL_PATTERN.test(cleanEmail)) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validateName(name: string) {
  const cleanName = name.trim();
  if (!cleanName) {
    return 'Add your name so WordWiz can greet you.';
  }
  if (cleanName.length > MAX_NAME_LENGTH) {
    return `Keep your name under ${MAX_NAME_LENGTH} characters.`;
  }
  return null;
}

export function validatePassword(password: string) {
  if (password.length < 8) {
    return 'Use at least 8 characters.';
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Keep your password under ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Use at least one letter and one number.';
  }
  return null;
}

export function toSafeUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export function toAuthUser(user: User): AuthUser {
  const name =
    getStringMetadata(user.user_metadata?.name) ||
    getStringMetadata(user.user_metadata?.full_name) ||
    user.email?.split('@')[0] ||
    'WordWiz learner';

  return {
    id: user.id,
    name,
    email: user.email ?? '',
    createdAt: user.created_at,
  };
}

export function getAuthRedirectUrl() {
  if (Platform.OS === 'web') {
    return getWebRedirectUrl();
  }

  return Linking.createURL('auth/callback');
}

/**
 * Completes an Auth session after Supabase redirects from a confirmation email.
 * Native sessions do not automatically read URLs, so only this trusted callback
 * path is allowed to set a session from a deep link.
 */
export async function completeSupabaseAuthRedirect(
  url: string,
  context?: AuthRequestContext,
) {
  if (!isAuthRedirectUrl(url)) {
    return null;
  }

  const params = getAuthParams(url);
  const authError = params.get('error_description') ?? params.get('error');
  if (authError) {
    throw new Error(authError);
  }

  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;

    await persistOAuthProviderTokens(getOAuthProvider(data.session?.user), data.session);

    logAuthRequest('auth:email_redirect_code', data.user, context);
    return data.user ? toAuthUser(data.user) : null;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) {
    return null;
  }

  const providerToken = params.get('provider_token');
  const providerRefreshToken = params.get('provider_refresh_token');

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;

  await persistOAuthProviderTokens(
    getOAuthProvider(data.session?.user),
    data.session
      ? {
          ...data.session,
          provider_token: providerToken ?? data.session.provider_token,
          provider_refresh_token: providerRefreshToken ?? data.session.provider_refresh_token,
        }
      : null,
  );

  logAuthRequest('auth:email_redirect_session', data.user, context);
  return data.user ? toAuthUser(data.user) : null;
}

export async function signInWithSupabase(
  email: string,
  password: string,
  context?: AuthRequestContext,
) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });

  if (error) {
    throw error;
  }

  await clearOAuthProviderTokens();

  logAuthRequest('auth:sign_in_password', data.user, context);

  return data.user ? toAuthUser(data.user) : null;
}

export async function signUpWithSupabase({
  name,
  email,
  password,
  context,
}: {
  name: string;
  email: string;
  password: string;
  context?: AuthRequestContext;
}) {
  const { data, error } = await supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: {
        name: name.trim(),
      },
    },
  });

  if (error) {
    throw error;
  }

  await clearOAuthProviderTokens();

  logAuthRequest('auth:sign_up', data.user, context);

  return {
    user: data.user ? toAuthUser(data.user) : null,
    needsEmailVerification: !data.session,
  };
}

export async function resendSupabaseEmailVerification(
  email: string,
  context?: AuthRequestContext,
) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }

  logAuthRequest('auth:resend_verification', { email: normalizeEmail(email) }, context);
}

export async function sendSupabasePasswordReset(
  email: string,
  context?: AuthRequestContext,
) {
  const { error } = await supabase.auth.resetPasswordForEmail(
    normalizeEmail(email),
    {
      redirectTo: getAuthRedirectUrl(),
    },
  );

  if (error) {
    throw error;
  }

  logAuthRequest('auth:password_reset', { email: normalizeEmail(email) }, context);
}

/** Updates the password for the authenticated user, including a recovery session. */
export async function updateSupabasePassword(
  password: string,
  context?: AuthRequestContext,
) {
  const { data, error } = await supabase.auth.updateUser({ password });

  if (error) {
    throw error;
  }

  logAuthRequest('auth:password_updated', data.user, context);
  return data.user ? toAuthUser(data.user) : null;
}

/**
 * Signs in with Apple's native iOS authorization sheet and exchanges the
 * resulting identity token for a Supabase session. Apple expects the hashed
 * nonce in its request while Supabase verifies the original raw nonce.
 */
export async function signInWithApple(context?: AuthRequestContext) {
  if (Platform.OS !== 'ios') {
    throw new Error('Native Apple sign-in is only available on iOS.');
  }

  let rawNonce: string;
  let hashedNonce: string;
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) {
      throw new Error('Sign in with Apple is not available on this device.');
    }

    rawNonce = await createAppleNonce();
    hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
  } catch (error) {
    reportError(error, {
      area: 'apple_sign_in_native_prepare',
      code: getErrorCode(error),
    });
    throw new Error('Apple sign-in could not be prepared. Please try again.');
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      nonce: hashedNonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    if (isAppleSignInCancellation(error)) {
      return null;
    }

    reportError(error, {
      area: 'apple_sign_in_native_request',
      code: getErrorCode(error),
    });
    throw new Error('Apple sign-in could not be completed. Please try again.');
  }

  if (!credential.identityToken) {
    const error = new Error('Apple sign-in did not return an identity token.');
    reportError(error, { area: 'apple_sign_in_native_identity_token' });
    throw error;
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });

  if (error) {
    reportError(error, { area: 'apple_sign_in_native_supabase' });
    throw new Error('Apple sign-in could not be completed. Please try again.');
  }

  if (!data.user || !data.session) {
    const sessionError = new Error('Apple sign-in did not return a Supabase session.');
    reportError(sessionError, { area: 'apple_sign_in_native_session' });
    throw sessionError;
  }

  // Native Apple authentication returns a one-time authorization code. Give
  // the trusted server a chance to exchange it for Apple's refresh token so
  // account deletion can revoke the Apple authorization automatically.
  await clearOAuthProviderTokens();
  if (credential.authorizationCode) {
    const appleProviderRefreshToken = await exchangeAppleAuthorizationCode(
      credential.authorizationCode,
    );
    if (appleProviderRefreshToken) {
      await persistOAuthProviderTokens('apple', {
        ...data.session,
        provider_refresh_token: appleProviderRefreshToken,
      });
    }
  } else {
    reportError(
      new Error('Apple sign-in did not return an authorization code.'),
      { area: 'apple_sign_in_native_authorization_code' },
    );
  }

  // Apple returns fullName only during the first authorization, and the
  // individual name fields can each be null. A metadata write is best effort:
  // it must never turn a successful authentication into a failed login.
  let appleName: string | null = null;
  try {
    appleName = getAppleFullName(credential.fullName);
  } catch (error) {
    // Name formatting is optional metadata and must never invalidate a valid
    // Apple authentication result.
    reportError(error, { area: 'apple_sign_in_native_name_format' });
  }
  let authenticatedUser = data.user;
  if (
    appleName &&
    !getStringMetadata(data.user.user_metadata?.name) &&
    !getStringMetadata(data.user.user_metadata?.full_name)
  ) {
    try {
      const metadataResult = await supabase.auth.updateUser({
        data: { name: appleName },
      });
      if (metadataResult.error) {
        reportError(metadataResult.error, { area: 'apple_sign_in_native_name' });
      } else if (metadataResult.data.user) {
        authenticatedUser = metadataResult.data.user;
      }
    } catch (error) {
      reportError(error, { area: 'apple_sign_in_native_name' });
    }
  }

  logAuthRequest('auth:native_apple_sign_in', authenticatedUser, context);
  return toAuthUser(authenticatedUser);
}

export async function signInWithOAuthProvider(
  provider: Provider,
  context?: AuthRequestContext,
) {
  await clearOAuthProviderTokens();
  const redirectTo = getAuthRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: Platform.OS !== 'web',
    },
  });

  if (error) {
    throw error;
  }

  logAuthRequest('auth:oauth_start', { provider }, context);

  if (Platform.OS === 'web') {
    return null;
  }

  if (!data.url) {
    throw new Error(`${provider} sign-in did not return an authorization URL.`);
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success') {
    return null;
  }

  const params = getAuthParams(result.url);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    throw new Error(`${provider} sign-in did not return a Supabase session.`);
  }

  const providerToken = params.get('provider_token');
  const providerRefreshToken = params.get('provider_refresh_token');

  const sessionResult = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionResult.error) {
    throw sessionResult.error;
  }

  const oauthSession = sessionResult.data.session;
  if (!oauthSession) {
    throw new Error(`${provider} sign-in did not return a Supabase session.`);
  }

  await persistOAuthProviderTokens(provider, {
    ...oauthSession,
    provider_token: providerToken ?? oauthSession.provider_token,
    provider_refresh_token: providerRefreshToken ?? oauthSession.provider_refresh_token,
  });

  logAuthRequest('auth:oauth_set_session', sessionResult.data.user, context);

  return sessionResult.data.user ? toAuthUser(sessionResult.data.user) : null;
}

export async function signOutWithSupabase(context?: AuthRequestContext) {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    logAuthRequest('auth:sign_out', null, context);
  } finally {
    // Provider tokens are only needed to revoke Sign in with Apple during the
    // account-deletion request. They must not survive a normal sign-out.
    await clearOAuthProviderTokens();
  }
}

export async function requestSupabaseAccountDeletion({
  screen,
  reason,
  appleProvider,
  appleProviderToken,
  appleProviderRefreshToken,
}: AuthRequestContext & Partial<StoredAppleProviderTokens>): Promise<AccountDeletionResult> {
  const body = {
    ...(appleProvider ? { appleProvider: true } : {}),
    ...(appleProviderToken ? { appleProviderToken } : {}),
    ...(appleProviderRefreshToken ? { appleProviderRefreshToken } : {}),
  };

  const invokeDeletion = (accessToken: string | null) => supabase.functions.invoke('delete-account', {
    method: 'DELETE',
    ...(accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : {}),
    body,
  });

  const { data: sessionData } = await supabase.auth.getSession();
  let accessToken = sessionData.session?.access_token ?? null;
  let result = await invokeDeletion(accessToken);

  // A long-lived app can still be showing an authenticated screen while its
  // access token has just expired. Retry only an explicit 401, so a request
  // that reached and deleted the account is never duplicated after a relay or
  // network failure.
  if (result.error && result.response?.status === 401) {
    const { data: refreshedSessionData, error: refreshError } =
      await supabase.auth.refreshSession();
    const refreshedAccessToken = refreshedSessionData.session?.access_token ?? null;
    if (!refreshError && refreshedAccessToken && refreshedAccessToken !== accessToken) {
      accessToken = refreshedAccessToken;
      result = await invokeDeletion(accessToken);
    }
  }

  const { data, error, response } = result;

  if (error) {
    const detail = await getFunctionErrorMessage(error, response);
    reportError(error, {
      area: 'account_deletion_request',
      status: response?.status ?? null,
      serverCode: detail,
    });
    throw new Error(`account_deletion_failed:${detail || error.message}`);
  }

  if (!data || data.deleted !== true) {
    throw new Error('The account deletion service did not confirm deletion.');
  }

  const appleRevocation = data.appleRevocation === 'revoked'
    ? 'revoked'
    : data.appleRevocation === 'manual_required'
      ? 'manual_required'
      : 'not_applicable';

  logAuthRequest('edge_function:delete_account', null, { screen, reason });
  return { deleted: true, appleRevocation };
}

async function getFunctionErrorMessage(error: unknown, response?: unknown): Promise<string> {
  const context = typeof error === 'object' && error && 'context' in error
    ? (error as { context?: unknown }).context
    : null;

  for (const candidate of [context, response]) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'json' in candidate &&
      typeof (candidate as { json?: unknown }).json === 'function'
    ) {
      try {
        const readable = typeof (candidate as { clone?: unknown }).clone === 'function'
          ? (candidate as unknown as { clone: () => unknown }).clone()
          : candidate;
        const payload = await (readable as {
          json: () => Promise<{ error?: unknown; code?: unknown; message?: unknown }>;
        }).json();
        if (typeof payload.code === 'string') return payload.code;
        if (typeof payload.error === 'string') return payload.error;
        if (typeof payload.message === 'string') return payload.message;
      } catch {
        // Fall through to the typed Supabase error below.
      }
    }
  }

  return error instanceof Error ? error.message : '';
}

/**
 * Provider tokens are emitted only once by Supabase after OAuth. Keep them in
 * the OS credential store so account deletion can ask the trusted server to
 * revoke a Sign in with Apple grant later.
 */
export async function persistOAuthProviderTokens(
  provider: unknown,
  session: Session | null,
) {
  if (provider !== 'apple') {
    await clearOAuthProviderTokens();
    return;
  }
  if (!session) {
    return;
  }

  const providerToken = getOptionalToken(session.provider_token);
  const providerRefreshToken = getOptionalToken(session.provider_refresh_token);
  if (!providerToken && !providerRefreshToken) {
    return;
  }

  try {
    await Promise.all([
      SecureStore.setItemAsync(
        APPLE_PROVIDER_TOKEN_KEY,
        providerToken ?? '',
        oauthTokenStoreOptions,
      ),
      SecureStore.setItemAsync(
        APPLE_PROVIDER_REFRESH_TOKEN_KEY,
        providerRefreshToken ?? '',
        oauthTokenStoreOptions,
      ),
      SecureStore.setItemAsync(
        APPLE_PROVIDER_USER_KEY,
        session.user.id,
        oauthTokenStoreOptions,
      ),
    ]);
  } catch (error) {
    // A device credential-store failure does not block sign-in. The deletion
    // flow will truthfully fall back to Apple's manual revoke instructions.
    reportError(error, { area: 'oauth_provider_token_storage' });
  }
}

export async function getStoredAppleProviderTokens(): Promise<StoredAppleProviderTokens | null> {
  let providerToken: string | null = null;
  let providerRefreshToken: string | null = null;
  let storedProviderUserId: string | null = null;
  try {
    [providerToken, providerRefreshToken, storedProviderUserId] = await Promise.all([
      SecureStore.getItemAsync(APPLE_PROVIDER_TOKEN_KEY, oauthTokenStoreOptions),
      SecureStore.getItemAsync(APPLE_PROVIDER_REFRESH_TOKEN_KEY, oauthTokenStoreOptions),
      SecureStore.getItemAsync(APPLE_PROVIDER_USER_KEY, oauthTokenStoreOptions),
    ]);
  } catch (error) {
    reportError(error, { area: 'oauth_provider_token_read' });
  }

  if (providerToken || providerRefreshToken) {
    try {
      const { data } = await supabase.auth.getSession();
      const currentUser = data.session?.user;
      if (
        storedProviderUserId &&
        currentUser?.id === storedProviderUserId &&
        getOAuthProvider(currentUser) === 'apple'
      ) {
        return {
          appleProvider: true,
          appleProviderToken: providerToken,
          appleProviderRefreshToken: providerRefreshToken,
        };
      }
    } catch (error) {
      reportError(error, { area: 'oauth_provider_token_owner_read' });
    }

    // Do not risk revoking a token that cannot be proven to belong to the
    // currently authenticated Apple user.
    await clearOAuthProviderTokens();
  }

  // On web, SecureStore is unavailable. A freshly completed OAuth session may
  // still hold the one-time provider token in memory, so use it if present.
  try {
    const { data } = await supabase.auth.getSession();
    if (getOAuthProvider(data.session?.user) === 'apple') {
      const appleProviderToken = getOptionalToken(data.session?.provider_token);
      const appleProviderRefreshToken = getOptionalToken(data.session?.provider_refresh_token);
      if (appleProviderToken || appleProviderRefreshToken) {
        return { appleProvider: true, appleProviderToken, appleProviderRefreshToken };
      }

      // If the native authorization-code exchange was unavailable, preserve
      // the provider identity so deletion can report that manual Apple
      // authorization revocation is still required.
      return {
        appleProvider: true,
        appleProviderToken: null,
        appleProviderRefreshToken: null,
      };
    }
  } catch (error) {
    reportError(error, { area: 'oauth_provider_token_session_read' });
  }

  return null;
}

export async function clearOAuthProviderTokens() {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(APPLE_PROVIDER_TOKEN_KEY, oauthTokenStoreOptions),
      SecureStore.deleteItemAsync(APPLE_PROVIDER_REFRESH_TOKEN_KEY, oauthTokenStoreOptions),
      SecureStore.deleteItemAsync(APPLE_PROVIDER_USER_KEY, oauthTokenStoreOptions),
    ]);
  } catch (error) {
    reportError(error, { area: 'oauth_provider_token_clear' });
  }
}

function logAuthRequest(
  source: string,
  payload: unknown,
  context?: AuthRequestContext,
) {
  if (!AUTH_REQUEST_LOGS_ENABLED) {
    return;
  }

  console.info('[WordWiz Supabase request]', {
    source,
    direction: 'auth/api',
    screen: context?.screen ?? 'unknown',
    reason: context?.reason ?? 'unknown',
    estimatedBytes: estimatePayloadBytes(payload),
  });
}

function estimatePayloadBytes(payload: unknown) {
  try {
    return new Blob([JSON.stringify(payload ?? null)]).size;
  } catch {
    return JSON.stringify(payload ?? null).length;
  }
}

function getStringMetadata(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function createAppleNonce() {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function exchangeAppleAuthorizationCode(authorizationCode: string) {
  try {
    const { data, error } = await supabase.functions.invoke('apple-token-exchange', {
      body: { authorizationCode },
    });
    if (error) {
      reportError(error, { area: 'apple_sign_in_native_token_exchange' });
      return null;
    }

    const refreshToken = data && typeof data === 'object'
      ? getOptionalToken((data as { refreshToken?: unknown }).refreshToken)
      : null;
    if (!refreshToken) {
      reportError(
        new Error('Apple token exchange did not return a refresh token.'),
        { area: 'apple_sign_in_native_token_exchange_response' },
      );
      return null;
    }

    return refreshToken;
  } catch (error) {
    // The exchange is needed for automatic Apple revocation, but a temporary
    // server failure must not reject an otherwise valid sign-in. Deletion will
    // accurately show the manual revoke path until a token is captured.
    reportError(error, { area: 'apple_sign_in_native_token_exchange' });
    return null;
  }
}

function getAppleFullName(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  if (!fullName) {
    return null;
  }

  const hasNamePart = [
    fullName.namePrefix,
    fullName.givenName,
    fullName.middleName,
    fullName.familyName,
    fullName.nameSuffix,
    fullName.nickname,
  ].some((part) => Boolean(getStringMetadata(part)));

  if (!hasNamePart) {
    return null;
  }

  return getStringMetadata(AppleAuthentication.formatFullName(fullName));
}

function isAppleSignInCancellation(error: unknown) {
  return getErrorCode(error) === 'ERR_REQUEST_CANCELED';
}

function getErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : 'unknown';
  }

  return 'unknown';
}

function getOAuthProvider(user: User | null | undefined) {
  const provider = user?.app_metadata?.provider;
  return typeof provider === 'string' ? provider : null;
}

function getOptionalToken(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 8192
    ? value
    : null;
}

function getWebRedirectUrl() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.location.origin;
}

function isAuthRedirectUrl(url: string) {
  const redirectUrl = getAuthRedirectUrl();
  return Boolean(redirectUrl && url.startsWith(redirectUrl));
}

function getAuthParams(url: string) {
  const parsedUrl = new URL(url);
  const params = new URLSearchParams(parsedUrl.search);
  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));

  hashParams.forEach((value, key) => {
    params.set(key, value);
  });

  return params;
}

export async function createStoredUser({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}): Promise<StoredUser> {
  const passwordSalt = createSalt();
  return {
    id: `${Date.now()}`,
    name: name.trim().slice(0, MAX_NAME_LENGTH),
    email: normalizeEmail(email),
    passwordSalt,
    passwordHash: await hashPassword(password, passwordSalt),
    createdAt: new Date().toISOString(),
  };
}

export async function verifyStoredPassword(
  user: StoredUser,
  password: string,
): Promise<{ valid: boolean; migratedUser?: StoredUser }> {
  if (user.passwordHash && user.passwordSalt) {
    const candidateHash = await hashPassword(password, user.passwordSalt);
    return { valid: timingSafeEqual(candidateHash, user.passwordHash) };
  }

  if (user.password && user.password === password) {
    const passwordSalt = createSalt();
    return {
      valid: true,
      migratedUser: {
        ...user,
        password: undefined,
        passwordSalt,
        passwordHash: await hashPassword(password, passwordSalt),
      },
    };
  }

  return { valid: false };
}

export function scrubStoredUsers(users: StoredUser[]) {
  return users.map((user) => {
    const { password: _password, ...safeUser } = user;
    return safeUser;
  });
}

function createSalt() {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string) {
  const payload = `wordwiz:v1:${salt}:${password}`;
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.subtle) {
    const bytes = utf8Bytes(payload);
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    return hexFromBytes(new Uint8Array(digest));
  }

  return sha256(payload);
}

function timingSafeEqual(first: string, second: string) {
  const length = Math.max(first.length, second.length);
  let diff = first.length ^ second.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0);
  }

  return diff === 0;
}

function utf8Bytes(value: string) {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);

    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function hexFromBytes(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sha256(value: string) {
  const bytes = utf8Bytes(value);
  const words: number[] = [];
  const bitLength = bytes.length * 8;
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] |= bytes[index] << (24 - (index % 4) * 8);
  }
  words[bytes.length >> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
  words[(((bytes.length + 8) >> 6) << 4) + 15] = bitLength;

  for (let block = 0; block < words.length; block += 16) {
    const schedule = Array.from(
      { length: 64 },
      (_item, index) => words[block + index] ?? 0,
    );
    const oldHash = hash.slice(0);

    for (let index = 16; index < 64; index += 1) {
      schedule[index] = add32(
        add32(add32(gamma1(schedule[index - 2]), schedule[index - 7]), gamma0(schedule[index - 15])),
        schedule[index - 16],
      );
    }

    for (let index = 0; index < 64; index += 1) {
      const temp1 = add32(
        add32(add32(add32(hash[7], sigma1(hash[4])), choose(hash[4], hash[5], hash[6])), constants[index]),
        schedule[index],
      );
      const temp2 = add32(sigma0(hash[0]), majority(hash[0], hash[1], hash[2]));
      hash = [
        add32(temp1, temp2),
        hash[0],
        hash[1],
        hash[2],
        add32(hash[3], temp1),
        hash[4],
        hash[5],
        hash[6],
      ];
    }

    hash = hash.map((item, index) => add32(item, oldHash[index]));
  }

  return hash.map((item) => item.toString(16).padStart(8, '0')).join('');
}

function add32(first: number, second: number) {
  return (first + second) >>> 0;
}

function rotateRight(value: number, amount: number) {
  return (value >>> amount) | (value << (32 - amount));
}

function choose(x: number, y: number, z: number) {
  return (x & y) ^ (~x & z);
}

function majority(x: number, y: number, z: number) {
  return (x & y) ^ (x & z) ^ (y & z);
}

function sigma0(value: number) {
  return rotateRight(value, 2) ^ rotateRight(value, 13) ^ rotateRight(value, 22);
}

function sigma1(value: number) {
  return rotateRight(value, 6) ^ rotateRight(value, 11) ^ rotateRight(value, 25);
}

function gamma0(value: number) {
  return rotateRight(value, 7) ^ rotateRight(value, 18) ^ (value >>> 3);
}

function gamma1(value: number) {
  return rotateRight(value, 17) ^ rotateRight(value, 19) ^ (value >>> 10);
}
