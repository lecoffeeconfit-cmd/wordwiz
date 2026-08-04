import { Platform } from 'react-native';
import { supabase } from './supabase';

export type CommunityPeriod = 'daily' | 'weekly' | 'all_time';
export type CommunityLevel = 'Novice' | 'Apprentice' | 'Journeyman' | 'Adept' | 'Mage' | 'Master' | 'Grandmaster';
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
  if (message.includes('avatar_not_uploaded')) return 'Your photo uploaded, but could not be verified. Please try again.';
  if (message.includes('invalid_avatar_path')) return 'Your photo could not be prepared. Please choose it again.';
  if (message.includes('community_profile_required')) return 'Create your Connect profile before adding a picture.';
  return 'Community is temporarily unavailable. Please try again.';
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(messageFor(error));
  return data as T;
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

export async function reportCommunityUser(publicId: string, reason: 'harassment' | 'spam' | 'inappropriate_name' | 'other') {
  await rpc<void>('community_report_user', { p_public_id: publicId, p_reason: reason });
}

export function getCommunityAvatarUrl(path: string | null) {
  if (!path) return null;
  return supabase.storage.from('community-avatars').getPublicUrl(path).data.publicUrl;
}

/** Pick, crop, resize, and upload an optional profile picture. */
export async function pickAndUploadCommunityAvatar(previousPath: string | null) {
  // Both modules require a matching native binary. Keep them out of the app's
  // import path so an optional avatar capability can never prevent startup.
  const [imagePickerModule, imageManipulatorModule] = await Promise.all([
    import('expo-image-picker'),
    import('expo-image-manipulator'),
  ]);
  const ImagePicker = imagePickerModule;
  const { manipulateAsync, SaveFormat } = imageManipulatorModule;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Please sign in and try again.');

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

  const image = await manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 512 } }],
    { compress: 0.82, format: SaveFormat.JPEG },
  );
  const imageResponse = await fetch(image.uri);
  const bytes = await imageResponse.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error('Choose a smaller photo and try again.');
  }
  const nextPath = `${userData.user.id}/avatar-${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from('community-avatars').upload(nextPath, bytes, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploadError) throw new Error('Could not upload your profile picture. Please try again.');

  try {
    await rpc<string>('community_set_avatar', { p_path: nextPath });
  } catch (error) {
    await supabase.storage.from('community-avatars').remove([nextPath]);
    throw error;
  }
  if (previousPath && previousPath !== nextPath) {
    await supabase.storage.from('community-avatars').remove([previousPath]);
  }
  return nextPath;
}
