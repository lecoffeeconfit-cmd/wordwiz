import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.10.0';

const appleSigningKeys = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const appleClientId = Deno.env.get('APPLE_CLIENT_ID');
  const appleClientSecret = Deno.env.get('APPLE_CLIENT_SECRET');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !supabaseAnonKey || !appleClientId || !appleClientSecret) {
    return jsonResponse({ error: 'Function environment is not configured' }, 500);
  }

  if (!authorization) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }

  let authorizationCode: string;
  try {
    const body = await request.json();
    authorizationCode = readAuthorizationCode(body);
  } catch {
    return jsonResponse({ error: 'Invalid Apple authorization code request' }, 400);
  }

  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: appleClientId,
      client_secret: appleClientSecret,
      code: authorizationCode,
      grant_type: 'authorization_code',
    }),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    console.error('Apple authorization-code exchange failed', {
      userId: user.id,
      status: response.status,
      error: getErrorValue(payload, 'error'),
    });
    return jsonResponse({ error: 'Could not validate Apple authorization code' }, 502);
  }

  const appleIdToken = getStringValue(payload, 'id_token');
  const expectedAppleSubject = getAppleIdentitySubject(user);
  if (!appleIdToken || !expectedAppleSubject) {
    console.error('Apple authorization-code exchange could not bind identity', {
      userId: user.id,
      status: response.status,
    });
    return jsonResponse({ error: 'Could not bind Apple authorization to this account' }, 502);
  }

  try {
    const { payload: claims } = await jwtVerify(
      appleIdToken,
      appleSigningKeys,
      {
        issuer: 'https://appleid.apple.com',
        audience: appleClientId,
      },
    );
    if (claims.sub !== expectedAppleSubject) {
      throw new Error('Apple subject does not match the signed-in account.');
    }
  } catch (error) {
    console.error('Apple authorization-code identity validation failed', {
      userId: user.id,
      error: getErrorMessage(error),
    });
    return jsonResponse({ error: 'Could not bind Apple authorization to this account' }, 502);
  }

  const refreshToken = getStringValue(payload, 'refresh_token');
  if (!refreshToken) {
    console.error('Apple authorization-code exchange returned no refresh token', {
      userId: user.id,
      status: response.status,
    });
    return jsonResponse({ error: 'Apple did not return a refresh token' }, 502);
  }

  // Return only the revocable token needed by the authenticated app. The
  // Apple client secret never leaves this server function.
  return jsonResponse({ refreshToken });
});

async function readJson(response: Response) {
  try {
    const value = await response.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readAuthorizationCode(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Request body must be an object.');
  }

  const authorizationCode = (value as { authorizationCode?: unknown }).authorizationCode;
  if (
    typeof authorizationCode !== 'string' ||
    authorizationCode.trim().length === 0 ||
    authorizationCode.length > 8192
  ) {
    throw new Error('Invalid Apple authorization code.');
  }

  return authorizationCode;
}

function getStringValue(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 8192
    ? candidate
    : null;
}

function getAppleIdentitySubject(user: {
  identities?: Array<{ provider?: string; identity_data?: unknown }>;
}) {
  const identity = user.identities?.find((candidate) => candidate.provider === 'apple');
  if (!identity || !identity.identity_data || typeof identity.identity_data !== 'object') {
    return null;
  }

  const subject = (identity.identity_data as { sub?: unknown }).sub;
  return typeof subject === 'string' && subject.length > 0 ? subject : null;
}

function getErrorValue(value: Record<string, unknown>, key: string) {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : 'unknown';
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' && message.trim() ? message : 'Unknown server error';
  }
  return 'Unknown server error';
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
