import { supabase } from './supabase';
import { env } from '../config/env';

export type AdminAccess = 'free' | 'complimentary' | 'plus';
export type AdminReportingRange = 'today' | '7d' | '30d' | 'all';

export type AdminDashboardMetrics = {
  totalUsers: number;
  newUsers7d: number;
  activeUsers7d: number;
  savedWords: number;
  quizAttempts7d: number;
  cardReviews7d: number;
  quizAccuracy30d: number;
  reminderUsers: number;
  plusUsers: number;
  freeLimitUsers: number;
  usersWithoutWords: number;
  learnersWithoutPractice: number;
  quizSeconds30d: number;
  cardSeconds30d: number;
  screenTime30d: Record<string, { seconds: number; sessions: number }>;
  questionTypeTime30d: Record<
    string,
    { seconds: number; answers: number; accuracy: number }
  >;
};

export type AdminOpportunity = {
  id: string;
  title: string;
  detail: string;
  metric: number;
  tone: 'purple' | 'blue' | 'orange' | 'red';
};

export type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  wordCount: number;
  quizCount: number;
  cardReviewCount: number;
  access: AdminAccess;
  freeWordsAdded: number;
  freeWordLimit: number;
  /** null means the learner has not created a Community profile. */
  communityEligible: boolean | null;
};

export type AdminTimeInsights = {
  completedLearningSeconds: number;
  screens: Array<{
    id: string;
    label: string;
    seconds: number;
    sessions: number;
  }>;
  questionTypes: Array<{
    id: string;
    label: string;
    seconds: number;
    answers: number;
    accuracy: number;
  }>;
};

export type AdminUsageLeader = {
  userId: string;
  name: string | null;
  email: string | null;
  wordsSaved: number;
  quizCount: number;
  cardReviewCount: number;
  learningActions: number;
};

export type AdminCollectionAdoption = {
  collectionId: string;
  name: string;
  learnerCount: number;
  memberWordCount: number;
};

export type AdminFlashcardUsage = {
  reviews: number;
  learners: number;
  seconds: number;
};

export type AdminStatsSectionEngagement = {
  id: string;
  interactions: number;
};

export type AdminCommunityInsights = {
  profiles: number;
  leaderboardProfiles: number;
  acceptedFriendships: number;
  pendingFriendships: number;
  friendRequestsSent: number;
  friendRequestsAccepted: number;
  friendRequestsDeclined: number;
  nudgesSent: number;
  nudgeSenders: number;
  nudgesRead: number;
  unreadNudges: number;
  activePushTokens: number;
  openReports: number;
  topNudgers: Array<{ publicId: string; displayName: string; nudges: number }>;
  topConnectors: Array<{
    publicId: string;
    displayName: string;
    connections: number;
    nudgesSent: number;
    nudgesReceived: number;
  }>;
  nudgeTemplates: Array<{ messageKey: string; sends: number }>;
  reports: Array<{ id: string; reportedUserId: string; displayName: string; reason: string; status: 'open' | 'resolved'; createdAt: string }>;
};

export type AdminDashboardData = {
  generatedAt: string;
  metrics: AdminDashboardMetrics;
  opportunities: AdminOpportunity[];
  timeInsights: AdminTimeInsights;
  topLearners: AdminUsageLeader[];
  topCollections: AdminCollectionAdoption[];
  flashcardUsage: AdminFlashcardUsage;
  statsSectionEngagement: AdminStatsSectionEngagement[];
  community: AdminCommunityInsights;
  users: AdminUser[];
  directory: {
    page: number;
    pageSize: number;
    totalUsers: number;
    totalPages: number;
  };
};

export type AdminUserAction =
  | 'reset_free_tier'
  | 'grant_complimentary_access'
  | 'delete_user'
  | 'community_disable_profile'
  | 'community_restore_profile'
  | 'community_resolve_reports';

async function invokeAdminDashboard<T>(
  method: 'GET' | 'POST',
  body?: unknown,
  query?: Record<string, string | number>,
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Your admin session has expired. Please sign in again.');
  }

  const endpoint = new URL(`${env.supabaseUrl}/functions/v1/admin-dashboard`);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    endpoint.searchParams.set(key, String(value));
  });
  const response = await fetch(endpoint.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: env.supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload: { error?: unknown; detail?: unknown } | null = null;
  try {
    payload = text ? JSON.parse(text) as { error?: unknown; detail?: unknown } : null;
  } catch {
    // A non-JSON gateway response falls back to the status below.
  }
  if (!response.ok) {
    const message = typeof payload?.detail === 'string'
      ? payload.detail
      : typeof payload?.error === 'string'
        ? payload.error
        : `Admin service returned ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

export async function getAdminAccess(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_my_admin');
  if (error) {
    // A client on an older database migration should remain a normal learner.
    return false;
  }
  return data === true;
}

export async function fetchAdminDashboard(
  page = 1,
  reportingRange: AdminReportingRange = '30d',
): Promise<AdminDashboardData> {
  return invokeAdminDashboard<AdminDashboardData>('GET', undefined, {
    page,
    range: reportingRange,
  });
}

export async function runAdminUserAction(
  action: AdminUserAction,
  userId: string,
): Promise<void> {
  await invokeAdminDashboard('POST', { action, userId });
}
