import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AVATAR_BUCKET = 'community-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

type CommunityProfile = { avatar_path: string | null };
type ModerationResponse = { results?: Array<{ flagged?: unknown }> };

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: corsHeaders, status });
}

function getDefaultProjectKey(variableName: string): string | null {
  const serializedKeys = Deno.env.get(variableName);
  if (!serializedKeys) return null;
  try {
    const keys = JSON.parse(serializedKeys) as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default) return keys.default;
    return Object.values(keys).find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
  } catch {
    return null;
  }
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publishableKey = getDefaultProjectKey('SUPABASE_PUBLISHABLE_KEYS') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = getDefaultProjectKey('SUPABASE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const authorization = request.headers.get('authorization');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !openAiApiKey || !authorization) {
    return json({ error: 'avatar_moderation_unavailable' }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: 'community_profile_required' }, 401);

  let body: { imageBase64?: unknown; moderationNoticeAccepted?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_avatar_image' }, 400);
  }
  if (body.moderationNoticeAccepted !== true) return json({ error: 'avatar_moderation_consent_required' }, 400);
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  const imageBytes = decodeJpeg(imageBase64);
  if (!imageBytes) return json({ error: 'invalid_avatar_image' }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: profile, error: profileError } = await admin
    .from('community_profiles')
    .select('avatar_path')
    .eq('user_id', user.id)
    .maybeSingle<CommunityProfile>();
  if (profileError || !profile) return json({ error: 'community_profile_required' }, 400);

  const { data: allowed, error: rateLimitError } = await admin.rpc('community_reserve_avatar_moderation', {
    p_user_id: user.id,
  });
  if (rateLimitError) return json({ error: 'avatar_moderation_unavailable' }, 503);
  if (!allowed) return json({ error: 'avatar_rate_limited' }, 429);

  let moderation: ModerationResponse;
  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }],
      }),
    });
    if (!response.ok) return json({ error: 'avatar_moderation_unavailable' }, 503);
    moderation = await response.json() as ModerationResponse;
  } catch {
    return json({ error: 'avatar_moderation_unavailable' }, 503);
  }

  const flagged = moderation.results?.[0]?.flagged;
  if (typeof flagged !== 'boolean') return json({ error: 'avatar_moderation_unavailable' }, 503);
  if (flagged) return json({ error: 'avatar_rejected' }, 422);

  const avatarPath = `${user.id}/avatar-${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(avatarPath, imageBytes, {
    contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
  });
  if (uploadError) return json({ error: 'avatar_not_uploaded' }, 503);

  const { error: updateError } = await admin
    .from('community_profiles')
    .update({
      avatar_path: avatarPath,
      avatar_updated_at: new Date().toISOString(),
      avatar_moderation_notice_at: new Date().toISOString(),
    })
    .eq('user_id', user.id);
  if (updateError) {
    await admin.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    return json({ error: 'avatar_not_uploaded' }, 503);
  }

  if (profile.avatar_path && isUsersAvatarPath(profile.avatar_path, user.id)) {
    await admin.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
  }
  return json({ avatarPath });
});
