import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const USER_DIRECTORY_PAGE_SIZE = 12;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type ReportingRange = 'today' | '7d' | '30d' | 'all';

function getDefaultProjectKey(variableName: string) {
  const serializedKeys = Deno.env.get(variableName);
  if (!serializedKeys) return undefined;

  try {
    const keys = JSON.parse(serializedKeys) as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default) return keys.default;
    return Object.values(keys).find(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  } catch {
    return undefined;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabasePublishableKey = getDefaultProjectKey('SUPABASE_PUBLISHABLE_KEYS') ??
    Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseAdminKey = getDefaultProjectKey('SUPABASE_SECRET_KEYS') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !supabasePublishableKey || !supabaseAdminKey) {
    return jsonResponse({ error: 'Function environment is not configured' }, 500);
  }
  if (!authorization) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const userClient = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user: requestingUser },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !requestingUser) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }

  // Use the same security-definer check as the mobile app. It evaluates the
  // caller's JWT against app_admins without exposing that table, and avoids a
  // misleading 403 when a service-role environment key is rotated or invalid.
  const { data: hasAdminAccess, error: accessError } = await userClient.rpc(
    'is_my_admin',
  );
  if (accessError) {
    console.error('admin access check failed', accessError);
    return jsonResponse({
      error: 'Admin access check is unavailable',
      detail: 'Apply the admin dashboard database migration, then try again.',
    }, 500);
  }
  if (hasAdminAccess !== true) {
    return jsonResponse({ error: 'Admin access is required' }, 403);
  }

  // SUPABASE_SECRET_KEYS is Supabase's current server-only key dictionary.
  // The legacy service_role key remains a fallback for older projects.
  const adminClient = createClient(supabaseUrl, supabaseAdminKey);

  if (request.method === 'GET') {
    try {
      const requestUrl = new URL(request.url);
      const requestedPage = Number(requestUrl.searchParams.get('page'));
      const requestedRange = requestUrl.searchParams.get('range');
      const reportingRange: ReportingRange =
        requestedRange === 'today' || requestedRange === '7d' ||
        requestedRange === '30d' || requestedRange === 'all'
          ? requestedRange
          : '30d';
      return jsonResponse(await buildDashboard(
        adminClient,
        Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
        reportingRange,
      ));
    } catch (error) {
      console.error('admin dashboard load failed', error);
      // This function is already limited to app_admins. Returning the database
      // message here lets an admin repair a missed migration without exposing
      // implementation details to ordinary learners.
      return jsonResponse({
        error: 'Could not load admin data',
        detail: getErrorMessage(error),
      }, 500);
    }
  }

  let body: { action?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  if (!body.userId || !UUID_PATTERN.test(body.userId)) {
    return jsonResponse({ error: 'A valid user ID is required' }, 400);
  }
  if (body.userId === requestingUser.id) {
    return jsonResponse({ error: 'You cannot change your own admin account here' }, 400);
  }
  if (!['reset_free_tier', 'grant_complimentary_access', 'delete_user'].includes(body.action ?? '')) {
    return jsonResponse({ error: 'Unknown admin action' }, 400);
  }

  const { data: targetResult, error: targetError } = await adminClient.auth.admin.getUserById(body.userId);
  if (targetError || !targetResult.user) {
    return jsonResponse({ error: 'This user no longer exists' }, 404);
  }

  if (body.action === 'delete_user') {
    const { data: targetAdmin, error: targetAdminError } = await adminClient
      .from('app_admins')
      .select('user_id')
      .eq('user_id', body.userId)
      .maybeSingle();
    if (targetAdminError) {
      return jsonResponse({ error: 'Could not verify this user’s admin status' }, 500);
    }
    if (targetAdmin) {
      return jsonResponse({ error: 'Admin accounts cannot be deleted from this console' }, 400);
    }
  }

  try {
    await runUserAction(adminClient, body.action as AdminAction, body.userId, requestingUser.id);
    return jsonResponse({ ok: true });
  } catch (error) {
    console.error('admin user action failed', error);
    return jsonResponse({
      error: 'Could not complete that admin action',
      detail: getErrorMessage(error),
    }, 500);
  }
});

type AdminAction = 'reset_free_tier' | 'grant_complimentary_access' | 'delete_user';
type UserRow = {
  id: string;
  email?: string;
  created_at: string;
  user_metadata?: { name?: string; full_name?: string };
};

async function buildDashboard(
  adminClient: ReturnType<typeof createClient>,
  page: number,
  reportingRange: ReportingRange,
) {
  const [metricsResult, directoryResult] = await Promise.all([
    adminClient.rpc('admin_dashboard_metrics', { p_range: reportingRange }),
    adminClient.auth.admin.listUsers({ page, perPage: USER_DIRECTORY_PAGE_SIZE }),
  ]);
  if (directoryResult.error) throw directoryResult.error;

  const directory = (directoryResult.data.users ?? []) as UserRow[];
  const directoryTotal = Number(directoryResult.data.total ?? directory.length);
  const directoryTotalPages = Math.max(
    1,
    Number(directoryResult.data.lastPage ?? Math.ceil(directoryTotal / USER_DIRECTORY_PAGE_SIZE)),
  );
  const metrics = metricsResult.error
    ? await buildFallbackMetrics(adminClient, directory.length, reportingRange)
    : metricsResult.data as Record<string, any>;
  if (metricsResult.error) {
    console.error('admin metrics RPC failed; using baseline metrics', metricsResult.error);
  }
  const userIds = directory.map((user) => user.id);
  const monthKey = new Date().toISOString().slice(0, 7);
  const [wordsResult, quizzesResult, reviewsResult, usageResult, entitlementResult, complimentaryResult] = userIds.length
    ? await Promise.all([
      adminClient.from('words').select('user_id, created_at, updated_at').in('user_id', userIds),
      adminClient.from('quiz_attempts').select('user_id, completed_at').in('user_id', userIds),
      adminClient.from('card_reviews').select('user_id, studied_at').in('user_id', userIds),
      adminClient.from('word_addition_usage').select('user_id, words_added').in('user_id', userIds).eq('month_key', monthKey),
      adminClient.from('subscription_entitlements').select('user_id, plus_is_active, plus_expires_at').in('user_id', userIds),
      adminClient.from('complimentary_access').select('user_id, complimentary_expires_at').in('user_id', userIds),
    ])
    : [emptyResult(), emptyResult(), emptyResult(), emptyResult(), emptyResult(), emptyResult()];

  for (const result of [wordsResult, quizzesResult, reviewsResult, usageResult, entitlementResult, complimentaryResult]) {
    if (result.error) throw result.error;
  }

  const wordsByUser = groupRows(wordsResult.data ?? []);
  const quizzesByUser = groupRows(quizzesResult.data ?? []);
  const reviewsByUser = groupRows(reviewsResult.data ?? []);
  const usageByUser = new Map((usageResult.data ?? []).map((row: any) => [row.user_id, Number(row.words_added) || 0]));
  const entitlementsByUser = new Map((entitlementResult.data ?? []).map((row: any) => [row.user_id, row]));
  const complimentaryByUser = new Map((complimentaryResult.data ?? []).map((row: any) => [row.user_id, row]));
  const now = Date.now();

  const users = directory.map((user) => {
    const wordRows = wordsByUser.get(user.id) ?? [];
    const quizRows = quizzesByUser.get(user.id) ?? [];
    const reviewRows = reviewsByUser.get(user.id) ?? [];
    const entitlement = entitlementsByUser.get(user.id) as any;
    const complimentary = complimentaryByUser.get(user.id) as any;
    const hasPlus = Boolean(entitlement?.plus_is_active) && (!entitlement?.plus_expires_at || new Date(entitlement.plus_expires_at).getTime() > now);
    const hasComplimentary = !hasPlus && Boolean(complimentary?.complimentary_expires_at) && new Date(complimentary.complimentary_expires_at).getTime() > now;
    const activityDates = [
      ...wordRows.map((row: any) => row.updated_at || row.created_at),
      ...quizRows.map((row: any) => row.completed_at),
      ...reviewRows.map((row: any) => row.studied_at),
    ].filter(Boolean).sort().reverse();

    return {
      id: user.id,
      email: user.email ?? 'No email address',
      name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? null,
      createdAt: user.created_at,
      lastActiveAt: activityDates[0] ?? null,
      wordCount: wordRows.length,
      quizCount: quizRows.length,
      cardReviewCount: reviewRows.length,
      access: hasPlus ? 'plus' : hasComplimentary ? 'complimentary' : 'free',
      freeWordsAdded: usageByUser.get(user.id) ?? 0,
      freeWordLimit: 10,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    metrics,
    opportunities: buildOpportunities(metrics),
    timeInsights: buildTimeInsights(metrics),
    users,
    directory: {
      page,
      pageSize: USER_DIRECTORY_PAGE_SIZE,
      totalUsers: directoryTotal,
      totalPages: directoryTotalPages,
    },
  };
}

async function buildFallbackMetrics(
  adminClient: ReturnType<typeof createClient>,
  directoryUserCount: number,
  reportingRange: ReportingRange,
) {
  const rangeStart = getRangeStart(reportingRange);
  const [words, quizzes, cards, recentQuizzes, recentCards, reminders, plusUsers, freeLimitUsers] = await Promise.all([
    countRows(adminClient, 'words'),
    countRows(adminClient, 'quiz_attempts'),
    countRows(adminClient, 'card_reviews'),
    countRows(adminClient, 'quiz_attempts', (query: any) => rangeStart ? query.gte('completed_at', rangeStart) : query),
    countRows(adminClient, 'card_reviews', (query: any) => rangeStart ? query.gte('studied_at', rangeStart) : query),
    countRows(adminClient, 'reminder_settings', (query: any) => query.eq('enabled', true)),
    countRows(adminClient, 'subscription_entitlements', (query: any) => query.eq('plus_is_active', true)),
    countRows(adminClient, 'word_addition_usage', (query: any) => query
      .eq('month_key', new Date().toISOString().slice(0, 7))
      .gte('words_added', 10)),
  ]);

  return {
    // Auth user totals require the aggregate RPC. The directory is deliberately
    // capped at 100, so label this as a baseline rather than inventing a count.
    totalUsers: directoryUserCount,
    newUsers7d: 0,
    activeUsers7d: 0,
    savedWords: words,
    quizAttempts7d: recentQuizzes,
    cardReviews7d: recentCards,
    quizAccuracy30d: 0,
    reminderUsers: reminders,
    plusUsers,
    freeLimitUsers,
    usersWithoutWords: 0,
    learnersWithoutPractice: 0,
    quizSeconds30d: 0,
    cardSeconds30d: 0,
    screenTime30d: {},
    questionTypeTime30d: {},
    quizAttempts: quizzes,
    cardReviews: cards,
  };
}

function getRangeStart(range: ReportingRange) {
  if (range === 'all') return null;
  const now = new Date();
  if (range === 'today') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  }
  const days = range === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function countRows(
  adminClient: ReturnType<typeof createClient>,
  table: string,
  refine?: (query: any) => any,
) {
  const baseQuery = adminClient.from(table).select('*', { count: 'exact', head: true });
  const { count, error } = await (refine ? refine(baseQuery) : baseQuery);
  if (error) throw error;
  return count ?? 0;
}

function emptyResult() {
  return { data: [], error: null };
}

function groupRows(rows: Array<{ user_id: string }>) {
  const groups = new Map<string, Array<{ user_id: string }>>();
  for (const row of rows) {
    groups.set(row.user_id, [...(groups.get(row.user_id) ?? []), row]);
  }
  return groups;
}

function buildOpportunities(metrics: Record<string, number>) {
  return [
    metrics.usersWithoutWords > 0 && {
      id: 'first-word', title: 'Help learners save their first word',
      detail: 'People who created an account but have not built a library yet.',
      metric: metrics.usersWithoutWords, tone: 'blue',
    },
    metrics.learnersWithoutPractice > 0 && {
      id: 'first-practice', title: 'Nudge saved words into a first practice',
      detail: 'Learners with words but no quiz or card review yet.',
      metric: metrics.learnersWithoutPractice, tone: 'purple',
    },
    metrics.freeLimitUsers > 0 && {
      id: 'free-limit', title: 'Review the free-tier learning moment',
      detail: 'Learners who reached this month’s free word allowance.',
      metric: metrics.freeLimitUsers, tone: 'orange',
    },
    metrics.quizAccuracy30d > 0 && metrics.quizAccuracy30d < 65 && {
      id: 'quiz-accuracy', title: 'Make recent quiz practice more approachable',
      detail: 'Average completed-answer accuracy over the last 30 days is below 65%.',
      metric: metrics.quizAccuracy30d, tone: 'red',
    },
  ].filter(Boolean);
}

function buildTimeInsights(metrics: Record<string, any>) {
  const screenLabels: Record<string, string> = {
    home: 'Home',
    words: 'Words',
    cards: 'Flashcards',
    quiz: 'Quiz',
    dashboard: 'Stats',
  };
  const questionLabels: Record<string, string> = {
    'word-to-definition': 'Meaning match',
    'definition-to-word': 'Word match',
    'true-false': 'True / false',
    'typed-word': 'Type the word',
    'sentence-usage': 'Sentence use',
    'sentence-completion': 'Complete context',
    'closest-synonym': 'Closest synonym',
    other: 'Other',
  };
  const screenTime = (metrics.screenTime30d ?? {}) as Record<string, any>;
  const questionTime = (metrics.questionTypeTime30d ?? {}) as Record<string, any>;

  return {
    completedLearningSeconds: Number(metrics.quizSeconds30d ?? 0) + Number(metrics.cardSeconds30d ?? 0),
    screens: Object.entries(screenTime)
      .map(([id, value]) => ({
        id,
        label: screenLabels[id] ?? id,
        seconds: Number(value?.seconds ?? 0),
        sessions: Number(value?.sessions ?? 0),
      }))
      .sort((first, second) => second.seconds - first.seconds),
    questionTypes: Object.entries(questionTime)
      .map(([id, value]) => ({
        id,
        label: questionLabels[id] ?? id,
        seconds: Number(value?.seconds ?? 0),
        answers: Number(value?.answers ?? 0),
        accuracy: Number(value?.accuracy ?? 0),
      }))
      .sort((first, second) => second.seconds - first.seconds),
  };
}

async function runUserAction(
  adminClient: ReturnType<typeof createClient>,
  action: AdminAction,
  targetUserId: string,
  adminUserId: string,
) {
  const now = new Date();
  if (action === 'reset_free_tier') {
    const { error } = await adminClient.from('word_addition_usage').upsert({
      user_id: targetUserId,
      month_key: now.toISOString().slice(0, 7),
      words_added: 0,
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id,month_key' });
    if (error) throw error;
  } else if (action === 'grant_complimentary_access') {
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { error } = await adminClient.from('complimentary_access').upsert({
      user_id: targetUserId,
      complimentary_started_at: now.toISOString(),
      complimentary_expires_at: expiresAt.toISOString(),
    }, { onConflict: 'user_id' });
    if (error) throw error;
  } else {
    const { error } = await adminClient.auth.admin.deleteUser(targetUserId, false);
    if (error) throw error;
  }

  const { error: auditError } = await adminClient.from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action,
  });
  if (auditError) throw auditError;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unknown server error';
}
