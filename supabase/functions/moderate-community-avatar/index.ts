import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AVATAR_BUCKET = 'community-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const MODERATION_TIMEOUT_MS = 12_000;
const MAX_MODERATION_ATTEMPTS = 2;
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

type CommunityProfile = { avatar_path: string | null };
type ModerationResponse = { results?: Array<{ flagged?: unknown }> };
type ModerationFailureCode =
  | 'avatar_moderation_configuration'
  | 'avatar_moderation_quota_exceeded'
  | 'avatar_moderation_request_invalid'
  | 'avatar_moderation_unavailable';
type ModerationRequestResult =
  | { moderation: ModerationResponse }
  | { error: ModerationFailureCode };
type ProviderError = { code?: string; type?: string };

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: corsHeaders, status });
}

function getDefaultProjectKey(variableName: string): string | null {
  const serializedKeys = Deno.env.get(variableName);
  if (!serializedKeys) return null;
  try {
    const keys = JSON.parse(serializedKeys) as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default.trim()) return keys.default.trim();
    const firstKey = Object.values(keys).find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    return firstKey?.trim() ?? null;
  } catch {
    return null;
  }
}

function normalizeBase64Image(base64: string): string {
  const trimmed = base64.trim();
  const commaIndex = trimmed.indexOf(',');
  if (commaIndex > 0 && /^data:image\/[\w.+-]+;base64$/i.test(trimmed.slice(0, commaIndex))) {
    return trimmed.slice(commaIndex + 1).trim();
  }
  return trimmed;
}

function decodeJpeg(base64: string): Uint8Array | null {
  if (
    !base64 ||
    base64.length > Math.ceil((MAX_AVATAR_BYTES * 4) / 3) + 4 ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  ) return null;

  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return isJpeg && bytes.byteLength <= MAX_AVATAR_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

function isUsersAvatarPath(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/avatar-`) && path.endsWith('.jpg');
}

function isTransientModerationStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function readProviderError(response: Response): Promise<ProviderError> {
  try {
    const payload = await response.json() as { error?: unknown };
    if (!payload.error || typeof payload.error !== 'object') return {};
    const providerError = payload.error as { code?: unknown; type?: unknown };
    return {
      code: typeof providerError.code === 'string' ? providerError.code : undefined,
      type: typeof providerError.type === 'string' ? providerError.type : undefined,
    };
  } catch {
    return {};
  }
}

function classifyModerationFailure(status: number, providerError: ProviderError): ModerationFailureCode {
  if (providerError.code === 'insufficient_quota' || providerError.type === 'insufficient_quota') {
    return 'avatar_moderation_quota_exceeded';
  }
  if (status === 401 || status === 403) return 'avatar_moderation_configuration';
  if (status === 400 || status === 422) return 'avatar_moderation_request_invalid';
  return 'avatar_moderation_unavailable';
}

async function requestModeration(imageBase64: string, openAiApiKey: string): Promise<ModerationRequestResult> {
  for (let attempt = 1; attempt <= MAX_MODERATION_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'omni-moderation-latest',
          input: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }],
        }),
        signal: controller.signal,
      });

      if (response.ok) {
        try {
          return { moderation: await response.json() as ModerationResponse };
        } catch {
          console.error('community avatar moderation returned invalid JSON');
          return { error: 'avatar_moderation_unavailable' };
        }
      }

      const providerError = await readProviderError(response);
      const failure = classifyModerationFailure(response.status, providerError);
      console.error('community avatar moderation request failed', {
        attempt,
        status: response.status,
        providerCode: providerError.code,
        providerType: providerError.type,
        failure,
      });
      const shouldRetry = failure === 'avatar_moderation_unavailable' && isTransientModerationStatus(response.status);
      if (!shouldRetry || attempt === MAX_MODERATION_ATTEMPTS) return { error: failure };
    } catch (error) {
      console.error('community avatar moderation request errored', {
        attempt,
        aborted: error instanceof DOMException && error.name === 'AbortError',
      });
      if (attempt === MAX_MODERATION_ATTEMPTS) return { error: 'avatar_moderation_unavailable' };
    } finally {
      clearTimeout(timeoutId);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { error: 'avatar_moderation_unavailable' };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // Keep both key formats available. The reservation RPC is explicitly
  // granted to the Postgres `service_role`, while newer projects may expose
  // the replacement secret-key bundle instead of the legacy key.
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
    || getDefaultProjectKey('SUPABASE_PUBLISHABLE_KEYS');
  const serviceRoleKeys = [
    getDefaultProjectKey('SUPABASE_SECRET_KEYS'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || null,
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
  const serviceRoleKey = serviceRoleKeys[0] ?? null;
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY')?.trim() || null;
  const authorization = request.headers.get('authorization');
  const missingConfiguration = [
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_PUBLISHABLE_KEY', publishableKey],
    ['SUPABASE_SECRET_KEY', serviceRoleKey],
    ['OPENAI_API_KEY', openAiApiKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !openAiApiKey) {
    console.error('community avatar moderation configuration missing', { keys: missingConfiguration });
    return json({ error: 'avatar_moderation_configuration' }, 503);
  }
  if (!authorization) return json({ error: 'authentication_required' }, 401);

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'authentication_required' }, 401);

  let body: { imageBase64?: unknown; moderationNoticeAccepted?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_avatar_image' }, 400);
  }
  if (body.moderationNoticeAccepted !== true) return json({ error: 'avatar_moderation_consent_required' }, 400);
  const imageBase64 = typeof body.imageBase64 === 'string' ? normalizeBase64Image(body.imageBase64) : '';
  const imageBytes = decodeJpeg(imageBase64);
  if (!imageBytes) return json({ error: 'invalid_avatar_image' }, 400);

  const adminClients = serviceRoleKeys.map((key) => createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }));
  // Try each supported server key format. This avoids a project-key format
  // mismatch turning into an outage before the OpenAI request is reached.
  let admin: ReturnType<typeof createClient> | null = null;
  let profile: CommunityProfile | null = null;
  let profileError: { code?: string; message?: string } | null = null;
  for (const candidate of adminClients) {
    const result = await candidate
      .from('community_profiles')
      .select('avatar_path')
      .eq('user_id', user.id)
      .maybeSingle<CommunityProfile>();
    if (!result.error) {
      admin = candidate;
      profile = result.data;
      profileError = null;
      break;
    }
    profileError = result.error;
  }
  if (!admin || profileError) {
    console.error('community avatar profile lookup failed', {
      code: profileError.code,
      message: profileError.message,
    });
    return json({ error: 'avatar_moderation_unavailable' }, 503);
  }
  if (!profile) return json({ error: 'community_profile_required' }, 400);

  let allowed: boolean | null = null;
  let rateLimitError: { code?: string; message?: string } | null = null;
  for (const candidate of adminClients) {
    const result = await candidate.rpc('community_reserve_avatar_moderation', {
      p_user_id: user.id,
    });
    if (!result.error) {
      admin = candidate;
      allowed = result.data;
      rateLimitError = null;
      break;
    }
    rateLimitError = result.error;
  }
  if (!admin || rateLimitError || allowed === null) {
    console.error('community avatar moderation rate-limit reservation failed', {
      code: rateLimitError.code,
      message: rateLimitError.message,
    });
    return json({ error: 'avatar_moderation_unavailable' }, 503);
  }
  if (!allowed) return json({ error: 'avatar_rate_limited' }, 429);

  const moderationResult = await requestModeration(imageBase64, openAiApiKey);
  if ('error' in moderationResult) {
    const status = moderationResult.error === 'avatar_moderation_request_invalid' ? 400 : 503;
    return json({ error: moderationResult.error }, status);
  }
  const moderation = moderationResult.moderation;

  const flagged = moderation.results?.[0]?.flagged;
  if (typeof flagged !== 'boolean') {
    console.error('community avatar moderation returned no flagged result');
    return json({ error: 'avatar_moderation_unavailable' }, 503);
  }
  if (flagged) return json({ error: 'avatar_rejected' }, 422);

  const avatarPath = `${user.id}/avatar-${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(avatarPath, imageBytes, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
  });
  if (uploadError) {
    console.error('community avatar upload failed', {
      name: uploadError.name,
      message: uploadError.message,
    });
    return json({ error: 'avatar_not_uploaded' }, 503);
  }

  const { error: updateError } = await admin
    .from('community_profiles')
    .update({
      avatar_path: avatarPath,
      avatar_updated_at: new Date().toISOString(),
      avatar_moderation_notice_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);
  if (updateError) {
    console.error('community avatar profile update failed', {
      code: updateError.code,
      message: updateError.message,
    });
    await admin.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    return json({ error: 'avatar_not_uploaded' }, 503);
  }

  if (profile.avatar_path && isUsersAvatarPath(profile.avatar_path, user.id)) {
    await admin.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
  }
  return json({ avatarPath });
});
