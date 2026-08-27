import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import { supabase } from './supabase';

export type CommunityPeriod = 'daily' | 'weekly' | 'all_time';
export type CommunityLevel = 'Novice' | 'Apprentice' | 'Journeyman' | 'Adept' | 'Mage' | 'Master' | 'Grandmaster';
export type WordCollectorPeriod = 'week' | 'month' | 'all_time';
export type WordCollectorAudience = 'all' | 'nearby' | 'state' | 'global';
export type CompetitiveMetric = 'collectors' | 'retention' | 'streaks';
export type CommunityTierSummary = {
  level: CommunityLevel;
  count: number;
  percentage: number;
};
export type CommunityProfile = {
  displayName: string;
  friendCode: string;
  avatarPath: string | null;
  profileVisible: boolean;
  leaderboardOptIn: boolean;
  friendRequestsEnabled: boolean;
  nudgesEnabled: boolean;
  pushNudgesEnabled: boolean;
};
export type CommunityContext = {
  enabled: boolean;
  profile: CommunityProfile | null;
  xp: number;
  allTimeXp: number;
  rank: number | null;
  level: CommunityLevel;
  tierSummary: CommunityTierSummary[];
  unreadNudges: number;
  incomingRequests: number;
};
export type CommunityLeaderboardEntry = {
  rank: number;
  publicId: string;
  displayName: string;
  avatarPath: string | null;
  wordCount: number;
  achievementsUnlocked: number;
  quizCount: number;
  flashcardReviewCount: number;
  activeStudyDays30d: number;
  xp: number;
  level: CommunityLevel;
  isMe: boolean;
};
export type WordCollectorEntry = {
  rank: number;
  publicId: string;
  displayName: string;
  avatarPath: string | null;
  wordCount: number;
  isMe: boolean;
  metricValue?: number;
  reviewCount?: number;
  retentionPercent?: number;
  retentionScore?: number;
  streakDays?: number;
};
export type WordCollectorContext = {
  eligible: boolean;
  hasLocation: boolean;
  rank: number | null;
  wordCount: number;
  totalUsers: number;
  metric?: CompetitiveMetric;
  metricValue?: number | null;
  reviewCount?: number;
  retentionPercent?: number;
  retentionScore?: number | null;
  streakDays?: number;
  qualified?: boolean;
  reviewsToQualify?: number;
  locationLabel?: string;
};
export type CompetitiveMetricContext = WordCollectorContext & { metric: CompetitiveMetric };
export type WordCollectorLocationPermission = 'granted' | 'denied' | 'undetermined';
export type WordCollectorLocationResult = 'ready' | 'denied' | 'unavailable';
export type CommunityConnection = {
  requestId: string;
  status: 'pending' | 'accepted';
  direction: 'incoming' | 'outgoing';
  publicId: string;
  displayName: string;
  avatarPath: string | null;
  isMuted: boolean;
};
export type CommunityNudge = {
  id: string;
  nudgeType: 'study_reminder' | 'streak_reminder' | 'five_word_challenge' | 'encouragement';
  messageKey: string;
  readAt: string | null;
  createdAt: string;
  senderPublicId: string;
  senderName: string;
  senderAvatarPath: string | null;
};

function messageFor(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('display_name_unavailable')) return 'That display name is already in use.';
  if (message.includes('invalid_display_name')) return 'Use 3–24 letters, numbers, spaces, hyphens, or underscores.';
  if (message.includes('friend_code_not_available')) return 'That friend code is unavailable. Check it and try again.';
  if (message.includes('friend_request_not_available')) return 'That learner is not accepting friend requests right now.';
  if (message.includes('cannot_add_yourself')) return 'That is your own friend code.';
  if (message.includes('friend_request_already_exists')) return 'A request already exists for this friend.';
  if (message.includes('relationship_unavailable')) return 'This connection is unavailable.';
  if (message.includes('nudge_rate_limited')) return 'You have sent the maximum number of nudges for now.';
  if (message.includes('friendship_required')) return 'You can nudge accepted friends only.';
  if (message.includes('avatar_rejected')) return "This picture can't be used as a profile photo. Please choose another one.";
  if (message.includes('avatar_rate_limited')) return 'You can update your profile picture up to five times every 15 minutes. Please try again shortly.';
  if (message.includes('avatar_moderation_unavailable')) return 'Profile picture checks are temporarily unavailable. Please try again shortly.';
  if (message.includes('avatar_moderation_consent_required')) return 'Please agree to the profile picture safety check before continuing.';
  if (message.includes('invalid_avatar_image')) return 'Choose a different photo and try again.';
  if (message.includes('avatar_not_uploaded')) return 'Your photo uploaded, but could not be verified. Please try again.';
  if (message.includes('invalid_avatar_path')) return 'Your photo could not be prepared. Please choose it again.';
  if (message.includes('community_profile_required')) return 'Create your Connect profile before adding a picture.';
  if (message.includes('collector_location_required')) return 'Nearby, State, and Country rankings need approximate location access.';
  return 'Community is temporarily unavailable. Please try again.';
}

async function messageFromFunctionError(error: unknown): Promise<string> {
  const context = typeof error === 'object' && error && 'context' in error
    ? (error as { context?: unknown }).context
    : null;
  if (
    context &&
    typeof context === 'object' &&
    'json' in context &&
    typeof (context as { json?: unknown }).json === 'function'
  ) {
    try {
      const payload = await (context as { json: () => Promise<{ error?: unknown }> }).json();
      if (typeof payload.error === 'string') return payload.error;
    } catch {
      // The generic function error below is still safe to show the user.
    }
  }
  return error instanceof Error ? error.message : '';
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(messageFor(error));
  return data as T;
}

function finiteNumber(value: unknown, fallback: number | null = null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function normalizeWordCollectorContext(value: unknown): WordCollectorContext {
  const record = objectValue(value);
  return {
    eligible: record?.eligible === true,
    hasLocation: record?.hasLocation === true,
    rank: finiteNumber(record?.rank),
    wordCount: finiteNumber(record?.wordCount, 0) ?? 0,
    totalUsers: finiteNumber(record?.totalUsers, 0) ?? 0,
    metric: record?.metric === 'retention' || record?.metric === 'streaks' ? record.metric : 'collectors',
    metricValue: finiteNumber(record?.metricValue),
    reviewCount: finiteNumber(record?.reviewCount, 0) ?? 0,
    retentionPercent: finiteNumber(record?.retentionPercent, 0) ?? 0,
    retentionScore: finiteNumber(record?.retentionScore),
    streakDays: finiteNumber(record?.streakDays, 0) ?? 0,
    qualified: record?.qualified !== false,
    reviewsToQualify: finiteNumber(record?.reviewsToQualify, 0) ?? 0,
    locationLabel: typeof record?.locationLabel === 'string' ? record.locationLabel : undefined,
  };
}

function normalizeWordCollectorEntries(value: unknown): WordCollectorEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = objectValue(item);
    const rank = finiteNumber(record?.rank);
    const wordCount = finiteNumber(record?.wordCount);
    const publicId = typeof record?.publicId === 'string' ? record.publicId : null;
    const displayName = typeof record?.displayName === 'string' ? record.displayName : null;
    if (rank === null || wordCount === null || !publicId || !displayName) return [];
    return [{
      rank,
      publicId,
      displayName,
      avatarPath: typeof record?.avatarPath === 'string' ? record.avatarPath : null,
      wordCount,
      isMe: record?.isMe === true,
      metricValue: finiteNumber(record?.metricValue) ?? undefined,
      reviewCount: finiteNumber(record?.reviewCount) ?? undefined,
      retentionPercent: finiteNumber(record?.retentionPercent) ?? undefined,
      retentionScore: finiteNumber(record?.retentionScore) ?? undefined,
      streakDays: finiteNumber(record?.streakDays) ?? undefined,
    }];
  });
}

export async function getCommunityContext(period: CommunityPeriod = 'weekly') {
  return rpc<CommunityContext>('community_my_context', { p_period: period });
}

export async function getCommunityLeaderboard(
  period: CommunityPeriod,
  limit: number,
  offset: number,
  level: CommunityLevel | null = null,
) {
  return rpc<CommunityLeaderboardEntry[]>('community_leaderboard', {
    p_period: period,
    p_limit: limit,
    p_offset: offset,
    p_level: level,
  });
}

export async function getWordCollectorsContext(
  period: WordCollectorPeriod,
  audience: WordCollectorAudience,
) {
  const data = await rpc<unknown>('word_collectors_my_context', {
    p_period: period,
    p_scope: audience,
  });
  return normalizeWordCollectorContext(data);
}

export async function getWordCollectorsLeaderboard(
  period: WordCollectorPeriod,
  audience: WordCollectorAudience,
  limit: number,
  offset: number,
) {
  const data = await rpc<unknown>('word_collectors_leaderboard', {
    p_period: period,
    p_scope: audience,
    p_limit: limit,
    p_offset: offset,
  });
  return normalizeWordCollectorEntries(data);
}

export async function getWordCollectorsMyRank(
  period: WordCollectorPeriod,
  audience: WordCollectorAudience,
) {
  const data = await rpc<unknown>('word_collectors_my_rank', {
    p_period: period,
    p_scope: audience,
    p_radius: 3,
  });
  return normalizeWordCollectorEntries(data);
}

export async function getCompetitiveMetricContext(
  metric: CompetitiveMetric,
  period: WordCollectorPeriod,
  audience: WordCollectorAudience,
): Promise<CompetitiveMetricContext> {
  const data = await rpc<unknown>('community_competitive_metric_context', {
    p_metric: metric,
    p_period: period,
    p_scope: audience,
  });
  return {
    ...normalizeWordCollectorContext(data),
    metric,
  };
}

export async function setCommunityDailyLearningGoal(
  goal: number,
  effectiveDate: string,
) {
  let timeZone = 'UTC';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // UTC keeps the server calculation safe if a platform omits timezone data.
  }
  await rpc<void>('community_set_daily_learning_goal', {
    p_goal: Math.max(1, Math.min(50, Math.round(goal))),
    p_effective_date: effectiveDate,
    p_time_zone: timeZone,
  });
}

export async function getCompetitiveMetricLeaderboard(
  metric: CompetitiveMetric,
  period: WordCollectorPeriod,
  audience: WordCollectorAudience,
  limit: number,
  offset: number,
) {
  const data = await rpc<unknown>('community_competitive_metric_leaderboard', {
    p_metric: metric,
    p_period: period,
    p_scope: audience,
    p_limit: limit,
    p_offset: offset,
  });
  return normalizeWordCollectorEntries(data);
}

export async function getCompetitiveMetricMyRank(
  metric: CompetitiveMetric,
  period: WordCollectorPeriod,
  audience: WordCollectorAudience,
) {
  const data = await rpc<unknown>('community_competitive_metric_my_rank', {
    p_metric: metric,
    p_period: period,
    p_scope: audience,
    p_radius: 3,
  });
  return normalizeWordCollectorEntries(data);
}

export async function getWordCollectorLocationPermission(): Promise<WordCollectorLocationPermission> {
  // Keeping this module dynamic guarantees that optional location support never
  // participates in app startup. It is checked only after a learner taps the
  // explicit location action for a location-based Word Collectors filter.
  const Location = await import('expo-location');
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.granted) return 'granted';
  return permission.status === 'denied' ? 'denied' : 'undetermined';
}

/**
 * Requests foreground location only after an explicit learner action, derives
 * broad competition keys on-device, and sends those keys (never coordinates or
 * an address) to the private server-side region table.
 */
export async function enableWordCollectorLocation(): Promise<WordCollectorLocationResult> {
  const Location = await import('expo-location');
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return 'denied';
  return updateWordCollectorLocation(Location);
}

/** Refreshes a permitted learner's coarse group without displaying a prompt. */
export async function refreshWordCollectorLocation(): Promise<WordCollectorLocationResult> {
  const Location = await import('expo-location');
  const permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) return 'denied';
  return updateWordCollectorLocation(Location);
}

async function updateWordCollectorLocation(
  Location: typeof import('expo-location'),
): Promise<WordCollectorLocationResult> {
  let location = await Location.getLastKnownPositionAsync({
    maxAge: 15 * 60 * 1000,
    requiredAccuracy: 50_000,
  });
  if (!location) {
    location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  }

  const { latitude, longitude } = location.coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'unavailable';

  // A two-degree grid represents a broad region, not a street, address, or
  // neighbourhood. This key never leaves the private region table.
  const areaKey = `area-${Math.floor((latitude + 90) / 2)}-${Math.floor((longitude + 180) / 2)}`;
  let stateKey: string | null = null;
  let countryKey: string | null = null;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    countryKey = collectorCountryKey(place?.isoCountryCode);
    stateKey = collectorStateKey(place?.isoCountryCode, place?.region);
  } catch {
    // Nearby still works with the coarse grid if a platform geocoder has no
    // answer. State simply remains unavailable until a future refresh succeeds.
  }

  await rpc<void>('word_collectors_set_my_location', {
    p_area_key: areaKey,
    p_state_key: stateKey,
    p_country_key: countryKey,
  });
  return 'ready';
}

function collectorStateKey(country: string | null | undefined, region: string | null | undefined) {
  const normalizedCountry = normalizeCollectorRegionPart(country);
  const normalizedRegion = normalizeCollectorRegionPart(region);
  return normalizedCountry && normalizedRegion
    ? `${normalizedCountry}-${normalizedRegion}`.slice(0, 96)
    : null;
}

function collectorCountryKey(country: string | null | undefined) {
  return normalizeCollectorRegionPart(country);
}

function normalizeCollectorRegionPart(value: string | null | undefined) {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || null;
}

export async function setupCommunityProfile(input: {
  displayName: string;
  profileVisible: boolean;
  leaderboardOptIn: boolean;
  friendRequestsEnabled: boolean;
  nudgesEnabled: boolean;
  pushNudgesEnabled: boolean;
}) {
  return rpc<CommunityProfile>('community_setup_profile', {
    p_name: input.displayName,
    p_profile_visible: input.profileVisible,
    p_leaderboard: input.leaderboardOptIn,
    p_requests: input.friendRequestsEnabled,
    p_nudges: input.nudgesEnabled,
    p_push_nudges: input.pushNudgesEnabled,
  });
}

export async function sendCommunityFriendRequest(friendCode: string) {
  await rpc<void>('community_send_friend_request', { p_friend_code: friendCode });
}

/** Sends a request from a leaderboard profile without exposing a friend code. */
export async function sendCommunityFriendRequestByPublicId(publicId: string) {
  await rpc<void>('community_send_friend_request_by_public_id', { p_public_id: publicId });
}

export async function respondToCommunityFriendRequest(requestId: string, accept: boolean) {
  await rpc<void>('community_respond_friend_request', { p_request_id: requestId, p_accept: accept });
}

export async function getCommunityConnections() {
  return rpc<CommunityConnection[]>('community_connections');
}

export async function removeOrBlockCommunityConnection(publicId: string, block: boolean) {
  await rpc<void>('community_remove_or_block', { p_public_id: publicId, p_block: block });
}

export async function setCommunityMute(publicId: string, muted: boolean) {
  await rpc<void>('community_set_mute', { p_public_id: publicId, p_muted: muted });
}

export async function getCommunityNudges(limit = 30, offset = 0) {
  return rpc<CommunityNudge[]>('community_nudge_inbox', { p_limit: limit, p_offset: offset });
}

export async function markCommunityNudgeRead(nudgeId: string) {
  await rpc<void>('community_mark_nudge_read', { p_nudge_id: nudgeId });
}

function requestId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && 'randomUUID' in cryptoApi) return cryptoApi.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2)}`;
}

export async function sendCommunityNudge(
  publicId: string,
  nudgeType: CommunityNudge['nudgeType'],
  messageKey = 'time_for_review',
) {
  const { error } = await supabase.functions.invoke('send-study-nudge', {
    body: { recipientPublicId: publicId, nudgeType, messageKey, idempotencyKey: requestId() },
  });
  if (error) throw new Error('Community is temporarily unavailable. Please try again.');
}

export async function registerCommunityPushToken(token: string) {
  await rpc<void>('community_register_push_token', {
    p_token: token,
    p_platform: Platform.OS === 'android' ? 'android' : 'ios',
  });
}

export async function deactivateCommunityPushTokens() {
  await rpc<void>('community_deactivate_my_push_tokens');
}

export async function reportCommunityUser(publicId: string, reason: 'harassment' | 'spam' | 'inappropriate_name' | 'inappropriate_avatar' | 'other') {
  await rpc<void>('community_report_user', { p_public_id: publicId, p_reason: reason });
}

export function getCommunityAvatarUrl(path: string | null) {
  if (!path) return null;
  return supabase.storage.from('community-avatars').getPublicUrl(path).data.publicUrl;
}

const AVATAR_MODERATION_NOTICE_KEY = '@wordwiz/community-avatar-moderation-notice/v1';

async function confirmAvatarModerationNotice(): Promise<boolean> {
  if (await AsyncStorage.getItem(AVATAR_MODERATION_NOTICE_KEY) === 'accepted') return true;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (accepted: boolean) => {
      if (settled) return;
      settled = true;
      resolve(accepted);
    };

    Alert.alert(
      'Profile picture safety',
      'Your selected photo will be sent to OpenAI only to screen it for harmful content before it is public in Connect. It is saved to WordWiz only if approved. Continue to agree.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => finish(false) },
        {
          text: 'Continue',
          onPress: () => {
            void AsyncStorage.setItem(AVATAR_MODERATION_NOTICE_KEY, 'accepted')
              .catch(() => undefined)
              .finally(() => finish(true));
          },
        },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

/** Pick any supported image, crop it, and convert it to a moderated JPEG avatar. */
export async function pickAndUploadCommunityAvatar() {
  // Both modules require a matching native binary. Keep them out of the app's
  // import path so an optional avatar capability can never prevent startup.
  const [imagePickerModule, imageManipulatorModule] = await Promise.all([
    import('expo-image-picker'),
    import('expo-image-manipulator'),
  ]);
  const ImagePicker = imagePickerModule;
  const { manipulateAsync, SaveFormat } = imageManipulatorModule;
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo permission is needed to choose a profile picture.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
    selectionLimit: 1,
  });
  if (result.canceled || !result.assets[0]) return null;

  // Ask for consent only after the learner has actually chosen a photo. This
  // keeps the tap-to-pick flow intuitive while still requiring consent before
  // any image is sent for moderation or uploaded.
  if (!await confirmAvatarModerationNotice()) return null;

  const image = await manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 512 } }],
    { base64: true, compress: 0.82, format: SaveFormat.JPEG },
  );

  if (!image.base64 || image.base64.length > 2_800_000) {
    throw new Error('Choose a smaller photo and try again.');
  }

  // The protected function converts no additional formats: any image the
  // device can pick has already become a normalized JPEG at this point.
  const { data, error } = await supabase.functions.invoke('moderate-community-avatar', {
    body: { imageBase64: image.base64, moderationNoticeAccepted: true },
  });
  if (error) {
    throw new Error(messageFor(new Error(await messageFromFunctionError(error))));
  }
  if (!data || typeof data.avatarPath !== 'string') throw new Error('avatar_not_uploaded');
  return data.avatarPath;
}
