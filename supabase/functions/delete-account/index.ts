import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { cleanupUserOwnedData } from '../_shared/accountDeletion.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'DELETE') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
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

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
  let body: Record<string, unknown>;
  let appleProvider: boolean;
  let appleProviderToken: string | null;
  let appleProviderRefreshToken: string | null;
  try {
    body = await readDeletionBody(request);
    appleProvider = body.appleProvider === true;
    appleProviderToken = readOptionalProviderToken(body, 'appleProviderToken');
    appleProviderRefreshToken = readOptionalProviderToken(body, 'appleProviderRefreshToken');
  } catch {
    return jsonResponse({ error: 'Invalid account deletion request' }, 400);
  }

  let appleRevocation: 'revoked' | 'manual_required' | 'not_applicable' = appleProvider
    ? 'manual_required'
    : 'not_applicable';
  if (appleProviderToken || appleProviderRefreshToken) {
    try {
      appleRevocation = await revokeAppleProviderToken(
        appleProviderToken,
        appleProviderRefreshToken,
      );
    } catch (error) {
      // Account deletion must not be blocked by an expired, already-revoked,
      // or temporarily unavailable Apple token. The account is still removed,
      // and the client tells the learner to revoke WordWiz manually if needed.
      console.warn('Apple token revocation failed; continuing account deletion', {
        userId: user.id,
        error: getErrorMessage(error),
      });
      appleRevocation = 'manual_required';
    }
  }

  try {
    await cleanupUserOwnedData(adminClient, user.id);
  } catch (error) {
    console.error('account deletion cleanup failed', {
      userId: user.id,
      error: getErrorMessage(error),
    });
    return jsonResponse({ error: 'Could not complete account deletion' }, 500);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(
    user.id,
    false,
  );

  if (deleteError) {
    console.error('account deletion auth removal failed', {
      userId: user.id,
      error: getErrorMessage(deleteError),
    });
    return jsonResponse({ error: 'Could not complete account deletion' }, 500);
  }

  return jsonResponse({ deleted: true, appleRevocation });
});

async function readDeletionBody(request: Request) {
  const rawBody = await request.text();
  if (!rawBody.trim()) return {};

  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Deletion body must be an object.');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('Deletion body is not valid JSON.');
  }
}

function readOptionalProviderToken(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 8192) {
    throw new Error('Invalid provider token.');
  }
  return value;
}

async function revokeAppleProviderToken(
  providerToken: string | null,
  providerRefreshToken: string | null,
) {
  const clientId = Deno.env.get('APPLE_CLIENT_ID');
  const clientSecret = Deno.env.get('APPLE_CLIENT_SECRET');
  const token = providerRefreshToken ?? providerToken;

  // Apple requires a server-generated client secret. If the project has not
  // configured the server credentials yet, deletion still completes and the
  // client tells the learner how to revoke WordWiz manually.
  if (!clientId || !clientSecret || !token) {
    console.warn('Apple token revocation is not configured; manual revoke required.');
    return 'manual_required' as const;
  }

  const tokenTypeHint = providerRefreshToken ? 'refresh_token' : 'access_token';
  const response = await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokenTypeHint,
    }),
  });

  if (!response.ok) {
    // Do not delete the WordWiz account if a supplied Apple token could not be
    // revoked. The learner remains signed in and can retry safely.
    throw new Error(`Apple token revocation returned HTTP ${response.status}.`);
  }

  return 'revoked' as const;
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
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
