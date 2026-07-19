const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const revenueCatIosApiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const appEnvironment =
  process.env.EXPO_PUBLIC_APP_ENVIRONMENT ??
  process.env.NODE_ENV ??
  'development';
const fallbackSupabaseUrl = 'https://missing-wordwiz-supabase.supabase.co';
const fallbackSupabaseAnonKey = 'missing-public-anon-key';
const configurationError = getConfigurationError();

export const env = {
  supabaseUrl: configurationError ? fallbackSupabaseUrl : supabaseUrl,
  supabaseAnonKey: configurationError
    ? fallbackSupabaseAnonKey
    : supabaseAnonKey,
  isSupabaseConfigured: !configurationError,
  configurationError,
  sentryDsn,
  isSentryConfigured: Boolean(sentryDsn),
  // RevenueCat public SDK keys are intentionally safe to bundle in a client app.
  // Keep the value in EAS/environment configuration so it is never duplicated in source.
  revenueCatIosApiKey,
  isRevenueCatIosConfigured: Boolean(revenueCatIosApiKey?.trim()),
  appEnvironment,
};

function getConfigurationError() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return 'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in the EAS production environment.';
  }

  if (getJwtRole(supabaseAnonKey) === 'service_role') {
    return 'EXPO_PUBLIC_SUPABASE_ANON_KEY contains a service-role key. Never ship service-role keys in the app bundle.';
  }

  return null;
}

function getJwtRole(token: string) {
  const payload = token.split('.')[1];
  if (!payload) {
    return null;
  }

  try {
    const normalizedPayload = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const decodedPayload = decodeBase64(normalizedPayload);
    const parsedPayload = JSON.parse(decodedPayload) as { role?: unknown };

    return typeof parsedPayload.role === 'string' ? parsedPayload.role : null;
  } catch {
    return null;
  }
}

function decodeBase64(value: string) {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let buffer = 0;
  let bits = 0;

  for (const character of value.replace(/=+$/, '')) {
    const index = alphabet.indexOf(character);
    if (index < 0) {
      throw new Error('Invalid base64 character.');
    }

    buffer = (buffer << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return output;
}
