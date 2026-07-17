import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLUS_ENTITLEMENT_ID = 'plus';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const revenueCatSecretApiKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !revenueCatSecretApiKey) {
    return new Response('Server configuration missing', { status: 500 });
  }

  const authorization = request.headers.get('authorization') ?? '';
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return new Response('Unauthorized', { status: 401 });

  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userData.user.id)}`,
      { headers: { Authorization: `Bearer ${revenueCatSecretApiKey}`, Accept: 'application/json' } },
    );
    if (!response.ok) throw new Error(`RevenueCat status ${response.status}`);

    const data = await response.json() as {
      subscriber?: {
        entitlements?: Record<string, { expires_date?: string | null }>;
      };
    };
    const plus = data.subscriber?.entitlements?.[PLUS_ENTITLEMENT_ID];
    const expiresAt = plus?.expires_date ?? null;
    const isActive = Boolean(plus) && (!expiresAt || new Date(expiresAt).getTime() > Date.now());
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await admin.from('subscription_entitlements').upsert({
      user_id: userData.user.id,
      plus_is_active: isActive,
      plus_expires_at: expiresAt,
      revenuecat_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    return Response.json({ plusActive: isActive });
  } catch (error) {
    console.error('RevenueCat entitlement sync failed', error);
    return new Response('Subscription verification failed', { status: 502 });
  }
});
