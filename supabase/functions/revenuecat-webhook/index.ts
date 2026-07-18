import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// RevenueCat entitlement identifiers are case-sensitive.
const PLUS_ENTITLEMENT_ID = 'Plus';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RevenueCatEvent = {
  app_user_id?: unknown;
  entitlement_ids?: unknown;
  expiration_at_ms?: unknown;
  event_timestamp_ms?: unknown;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const expectedAuthorization = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expectedAuthorization || request.headers.get('authorization') !== `Bearer ${expectedAuthorization}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return new Response('Server configuration missing', { status: 500 });

  try {
    const payload = await request.json() as { event?: RevenueCatEvent };
    const event = payload.event;
    const userId = typeof event?.app_user_id === 'string' ? event.app_user_id : '';
    const entitlementIds = Array.isArray(event?.entitlement_ids) ? event.entitlement_ids : [];
    if (!UUID_PATTERN.test(userId) || !entitlementIds.includes(PLUS_ENTITLEMENT_ID)) {
      return new Response('Ignored', { status: 200 });
    }

    const expiresAt = asIsoDate(event?.expiration_at_ms);
    const eventAt = asIsoDate(event?.event_timestamp_ms) ?? new Date().toISOString();
    const plusIsActive = !expiresAt || new Date(expiresAt).getTime() > Date.now();
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await admin.from('subscription_entitlements').upsert({
      user_id: userId,
      plus_is_active: plusIsActive,
      plus_expires_at: expiresAt,
      revenuecat_event_at: eventAt,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('RevenueCat webhook failed', error);
    return new Response('Webhook processing failed', { status: 500 });
  }
});

function asIsoDate(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}
