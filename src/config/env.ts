const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const forbiddenPublicSecrets = [
  process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
  process.env.EXPO_PUBLIC_SERVICE_ROLE_KEY,
  process.env.EXPO_PUBLIC_OPENAI_API_KEY,
  process.env.EXPO_PUBLIC_SECRET_KEY,
].filter(Boolean);

if (forbiddenPublicSecrets.length > 0) {
  throw new Error(
    'A secret key was configured with EXPO_PUBLIC_. Public Expo variables are bundled into the app. Move secrets to Supabase Edge Functions or another backend.',
  );
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

if (getJwtRole(supabaseAnonKey) === 'service_role') {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY contains a service-role key. Never ship service-role keys in the app bundle.',
  );
}

export const env = {
  supabaseUrl,
  supabaseAnonKey,
};

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
