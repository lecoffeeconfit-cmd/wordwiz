import type { AuthUser, StoredUser } from '../types';
import { supabase } from './supabase';
import type { Provider, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

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
  );

  if (error) {
    throw error;
  }

  logAuthRequest('auth:password_reset', { email: normalizeEmail(email) }, context);
}

export async function signInWithOAuthProvider(
  provider: Provider,
  context?: AuthRequestContext,
) {
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

  const sessionResult = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionResult.error) {
    throw sessionResult.error;
  }

  logAuthRequest('auth:oauth_set_session', sessionResult.data.user, context);

  return sessionResult.data.user ? toAuthUser(sessionResult.data.user) : null;
}

export async function signOutWithSupabase(context?: AuthRequestContext) {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  logAuthRequest('auth:sign_out', null, context);
}

export async function requestSupabaseAccountDeletion(context?: AuthRequestContext) {
  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'DELETE',
  });

  if (error) {
    throw error;
  }

  logAuthRequest('edge_function:delete_account', null, context);
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

function getWebRedirectUrl() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.location.origin;
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
