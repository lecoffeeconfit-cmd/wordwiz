import { Ionicons } from '@expo/vector-icons';
import { Canvas as SkiaCanvas, Circle as SkiaCircle, Group as SkiaGroup, Path as SkiaPath, Skia, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { ActivityIndicator, Alert, Animated, Easing, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS } from '../constants/theme';
import type { AnalyticsData, LegalPage, QuizAnswer, QuizDifficultyPreference, QuizPreferences, QuizProgress, QuizQuestion, QuizQuestionMode, ReminderSettings, SortMode, TimeBasedLearningSettings, Word } from '../types';
import type { QuizFeedbackSummary } from '../utils';
import type { AuthUser } from '../types';
import { styles } from '../styles';
import { DEFAULT_TIME_BASED_LEARNING_SETTINGS, MASTERY_LEVELS, buildAchievements, buildQuiz, calculateStreakStats, FLUENT_RECALL_SECONDS, formatReminderTime, formatStudyTime, getDayKey, getDueReviewWords, getHeroProgressColor, getMasteryLevel, getMasteryLevelProgress, getNextMasteryLevel, getOmegaTestAttempts, getProgressColor, getProgressPaleColor, getQuizAttemptKind, getQuizFeedbackByWord, getQuizFeedbackSummary, getQuizRecallPaceByQuestionType, getQuizRecallPaceByWord, getQuizResponseSignalSummary, getQuizRetrievalProfile, getRecentDays, getRecentStreakLengths, getStreakMessage, getStreakMilestone, getStreakWeek, getWordMastery, getWordMasteryCategory, getWordMasteryCategoryForWord, normalizeQuestionTypePreferences, normalizeTimeBasedLearningSettings, shuffle } from '../utils';
import { CompactPagination, DashboardSection, DashboardStat, EmptyPractice, HomeAction, HomeMiniCard, LegalLink, LevelRow, ProgressFill, QuizComplete, QuizFact, ReminderTimeButton, ScreenHeader, StreakDay, WordInfoPanel, WordRow, SortButton } from '../components';
import { LessonProgressRing } from '../components/dashboard/LessonProgressRing';
import { useSubscription } from '../subscription/SubscriptionProvider';

const EXPANDED_LIST_PAGE_SIZE = 8;
const RETRIEVAL_PROGRESSION_STEPS = [
  'See the word and meaning',
  'Choose the definition',
  'Choose the word from its meaning',
  'Use context and distinguish close meanings',
  'Type the word from its definition',
  'Recall it again after a longer delay',
];
const QUIZ_TREND_PAGE_SIZE = 6;
const DUE_REVIEW_PREVIEW_SIZE = 6;
const ACHIEVEMENT_PAGE_SIZE = 4;
const DAILY_ACTIVITY_TARGET_STUDY_SECONDS = 10 * 60;
const QUIZ_ACCURACY_RING_SIZE = 116;
const QUIZ_ACCURACY_RING_STROKE = 14;
const QUIZ_ACCURACY_RING_RADIUS = (QUIZ_ACCURACY_RING_SIZE - QUIZ_ACCURACY_RING_STROKE) / 2;
const QUIZ_DIFFICULTY_OPTIONS: { id: QuizDifficultyPreference; label: string }[] = [
  { id: 'automatic', label: 'Auto' },
  { id: 'easy', label: 'Easy' },
  { id: 'standard', label: 'Standard' },
  { id: 'hard', label: 'Hard' },
  { id: 'ultra', label: 'Ultra' },
];

const QUESTION_TYPE_OPTIONS: {
  id: QuizQuestionMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  mastery: string;
  strength: string;
}[] = [
  {
    id: 'word-to-definition',
    label: 'Meaning match',
    icon: 'book-outline',
    description: 'See the word, then connect it to the right meaning. A gentle first step for a new word.',
    mastery: '+5 mastery when correct',
    strength: 'Foundation',
  },
  {
    id: 'definition-to-word',
    label: 'Word match',
    icon: 'swap-horizontal-outline',
    description: 'Start from the meaning and choose the word. This asks you to retrieve more than a simple recognition check.',
    mastery: '+7 mastery when correct',
    strength: 'Growing recall',
  },
  {
    id: 'true-false',
    label: 'True or false',
    icon: 'checkmark-circle-outline',
    description: 'Spot whether a word and meaning truly belong together. It is a quick confidence check between deeper prompts.',
    mastery: '+3 mastery when correct',
    strength: 'Quick check',
  },
  {
    id: 'typed-word',
    label: 'Type the word',
    icon: 'create-outline',
    description: 'Bring the word to mind without answer choices. This gives the strongest direct-recall practice once you have a foundation.',
    mastery: '+10 mastery when correct',
    strength: 'Strongest recall',
  },
  {
    id: 'sentence-usage',
    label: 'Sentence context',
    icon: 'chatbubble-ellipses-outline',
    description: 'Choose the sentence that uses the word naturally. It builds understanding beyond memorizing a definition.',
    mastery: '+5 mastery when correct',
    strength: 'Real-world use',
  },
  {
    id: 'sentence-completion',
    label: 'Complete the context',
    icon: 'text-outline',
    description: 'Use context clues to supply the missing word. It combines meaning, usage, and retrieval.',
    mastery: '+7 mastery when correct',
    strength: 'Contextual recall',
  },
  {
    id: 'closest-synonym',
    label: 'Closest synonym',
    icon: 'git-compare-outline',
    description: 'Distinguish a word from nearby meanings. This helps make vocabulary knowledge more precise.',
    mastery: '+5 mastery when correct',
    strength: 'Meaning precision',
  },
];

export function DashboardScreen({
  words,
  analytics,
  timedLearningEnabled,
  timeBasedLearningSettings,
  quizPreferences,
  currentUser,
  reminderSettings,
  dailyQuizGoal,
  achievementPoints,
  refreshTokens,
  onReviewDue,
  onStudyFlaggedCards,
  onStudyFlaggedQuiz,
  onSetWordFlagState,
  onToggleWordFocus,
  onToggleWordReviewNext,
  onUpdateReminder,
  onUpdateDailyQuizGoal,
  onTimedLearningChange,
  onTimeBasedLearningSettingsChange,
  onQuizPreferencesChange,
  onOpenLegal,
  onLogout,
  onDeleteAccount,
  onOpenOnboardingGuide,
  onOpenPlus,
}: {
  words: Word[];
  analytics: AnalyticsData;
  timedLearningEnabled: boolean;
  timeBasedLearningSettings: TimeBasedLearningSettings;
  quizPreferences: QuizPreferences;
  currentUser: AuthUser | null;
  reminderSettings: ReminderSettings;
  dailyQuizGoal: number;
  achievementPoints: number;
  refreshTokens: number;
  onReviewDue: (priorityWordIds?: string[]) => void;
  onStudyFlaggedCards: () => void;
  onStudyFlaggedQuiz: () => void;
  onSetWordFlagState: (wordIds: string[], isFlagged: boolean) => void;
  onToggleWordFocus: (wordId: string) => void;
  onToggleWordReviewNext: (wordId: string) => void;
  onUpdateReminder: (settings: ReminderSettings) => void;
  onUpdateDailyQuizGoal: (goal: number) => void;
  onTimedLearningChange: (enabled: boolean) => void;
  onTimeBasedLearningSettingsChange: (settings: TimeBasedLearningSettings) => void;
  onQuizPreferencesChange: (preferences: QuizPreferences) => void;
  onOpenLegal: (page: LegalPage) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onOpenOnboardingGuide: () => void;
  onOpenPlus: () => void;
}) {
  const subscription = useSubscription();
  const plusEntitlement = subscription.customerInfo?.entitlements.active.Plus;
  const isComplimentary = subscription.accessSource === 'complimentary';
  const isSubscribed = subscription.accessSource === 'subscription';
  const subscriptionStatus = subscription.isAccessLoading || subscription.isLoading
    ? 'CHECKING'
    : isSubscribed
      ? 'ACTIVE'
      : isComplimentary
        ? 'ACTIVE'
        : 'FREE';
  const subscriptionDate = isComplimentary
    ? subscription.complimentaryExpiresAt
    : plusEntitlement?.expirationDate ?? subscription.customerInfo?.allExpirationDates.Plus ?? null;
  const subscriptionDateLabel = isComplimentary
    ? 'COMPLIMENTARY ENDS'
    : isSubscribed
      ? plusEntitlement?.willRenew
        ? 'RENEWS'
        : 'EXPIRES'
      : 'WORD LIMIT';
  const subscriptionDateValue = isComplimentary
    ? subscriptionDate
      ? formatSubscriptionDate(subscriptionDate)
      : 'Checking access'
    : isSubscribed
      ? subscriptionDate
        ? formatSubscriptionDate(subscriptionDate)
        : 'Managed by Apple'
      : subscription.monthlyWordsAdded === null
        ? 'Checking usage'
        : `${subscription.monthlyWordsAdded} of ${subscription.monthlyWordLimit} added`;
  const [achievementsExpanded, setAchievementsExpanded] = useState(false);
  const [achievementPage, setAchievementPage] = useState(0);
  const [masteryExpanded, setMasteryExpanded] = useState(false);
  const [quizTrendExpanded, setQuizTrendExpanded] = useState(false);
  const [practiceEstimateExpanded, setPracticeEstimateExpanded] = useState(false);
  const [isRetrievalProgressionExpanded, setIsRetrievalProgressionExpanded] = useState(false);
  const [dueReviewsExpanded, setDueReviewsExpanded] = useState(false);
  const [dueReviewPage, setDueReviewPage] = useState(0);
  const pendingDueReviewTap = useRef<{
    wordId: string;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [masteryPage, setMasteryPage] = useState(0);
  const [quizTrendPage, setQuizTrendPage] = useState(0);
  const [feedbackView, setFeedbackView] = useState<'overall' | 'words'>('overall');
  const [recallPaceView, setRecallPaceView] = useState<'types' | 'words'>('types');
  const [activityWindow, setActivityWindow] = useState<7 | 30>(7);
  const [isTimeSettingsExpanded, setIsTimeSettingsExpanded] = useState(false);
  const [isQuestionMixExpanded, setIsQuestionMixExpanded] = useState(false);
  const [expandedQuestionType, setExpandedQuestionType] = useState<QuizQuestionMode | null>(null);
  const normalizedTimeSettings = normalizeTimeBasedLearningSettings(
    timeBasedLearningSettings,
  );
  const normalizedQuestionTypePreferences = normalizeQuestionTypePreferences(
    quizPreferences.questionTypes,
  );
  const enabledQuestionTypeCount = QUESTION_TYPE_OPTIONS.filter(
    (option) => normalizedQuestionTypePreferences[option.id].enabled,
  ).length;
  const masterSparkleScale = useRef(new Animated.Value(1)).current;
  const flaggedCountScale = useRef(new Animated.Value(1)).current;
  const streakSparkleFloat = useRef(new Animated.Value(0)).current;
  const streakSparklePulse = useRef(new Animated.Value(0.38)).current;
  const refreshTokenPulse = useRef(new Animated.Value(1)).current;
  const refreshTokenFloat = useRef(new Animated.Value(0)).current;
  const refreshTokenGlow = useRef(new Animated.Value(0.45)).current;
  const [recentlyUnflaggedWordIds, setRecentlyUnflaggedWordIds] = useState<string[]>([]);
  const lastMasteryRowTapAt = useRef(0);
  const lastAchievementTapAt = useRef(0);
  const lastQuizTrendTapAt = useRef(0);
  const todayKey = getDayKey();
  const recentDays = getRecentDays(activityWindow);
  const totalQuizQuestions = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.total,
    0,
  );
  const totalCorrect = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.score,
    0,
  );
  const totalWrong = Math.max(0, totalQuizQuestions - totalCorrect);
  const accuracy = totalQuizQuestions
    ? Math.round((totalCorrect / totalQuizQuestions) * 100)
    : 0;
  const hasQuizAnswers = totalQuizQuestions > 0;
  const hasNoCorrectAnswers = hasQuizAnswers && totalCorrect === 0;
  const omegaTestAttempts = getOmegaTestAttempts(analytics);
  const omegaTestAverage = omegaTestAttempts.length
    ? Math.round(
        omegaTestAttempts.reduce(
          (total, attempt) =>
            total + (attempt.total ? (attempt.score / attempt.total) * 100 : 0),
          0,
        ) / omegaTestAttempts.length,
      )
    : 0;
  const omegaTestBest = omegaTestAttempts.reduce(
    (best, attempt) =>
      Math.max(
        best,
        attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0,
      ),
    0,
  );
  const flaggedWordIds = words.filter((word) => word.isFlagged).map((word) => word.id);
  const flaggedCount = flaggedWordIds.length;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(flaggedCountScale, {
        toValue: 1.12,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(flaggedCountScale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [flaggedCount, flaggedCountScale]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(streakSparkleFloat, {
            toValue: -4,
            duration: 1700,
            useNativeDriver: true,
          }),
          Animated.timing(streakSparkleFloat, {
            toValue: 0,
            duration: 1700,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(streakSparklePulse, {
            toValue: 0.95,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(streakSparklePulse, {
            toValue: 0.38,
            duration: 1200,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [streakSparkleFloat, streakSparklePulse]);

  useEffect(() => {
    if (refreshTokens === 0) {
      refreshTokenPulse.setValue(1);
      refreshTokenFloat.setValue(0);
      refreshTokenGlow.setValue(0.28);
      return;
    }

    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(refreshTokenPulse, {
            toValue: 1.08,
            duration: 1050,
            useNativeDriver: true,
          }),
          Animated.timing(refreshTokenPulse, {
            toValue: 1,
            duration: 1050,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(refreshTokenFloat, {
            toValue: -2,
            duration: 1300,
            useNativeDriver: true,
          }),
          Animated.timing(refreshTokenFloat, {
            toValue: 0,
            duration: 1300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(refreshTokenGlow, {
            toValue: 0.9,
            duration: 1050,
            useNativeDriver: true,
          }),
          Animated.timing(refreshTokenGlow, {
            toValue: 0.38,
            duration: 1050,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [refreshTokenFloat, refreshTokenGlow, refreshTokenPulse, refreshTokens]);

  function toggleAllFlags() {
    if (recentlyUnflaggedWordIds.length > 0) {
      onSetWordFlagState(recentlyUnflaggedWordIds, true);
      setRecentlyUnflaggedWordIds([]);
      return;
    }

    if (flaggedWordIds.length === 0) return;
    onSetWordFlagState(flaggedWordIds, false);
    setRecentlyUnflaggedWordIds(flaggedWordIds);
  }
  const feedbackSummary = getQuizFeedbackSummary(analytics);
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const feedbackByWord = getQuizFeedbackByWord(analytics)
    .map((feedback) => ({
      ...feedback,
      term: wordsById.get(feedback.wordId)?.term ?? 'Saved word',
    }))
    .slice(0, 6);
  const recallPaceByType = getQuizRecallPaceByQuestionType(analytics);
  const recallPaceByWord = getQuizRecallPaceByWord(analytics)
    .map((pace) => ({
      ...pace,
      term: wordsById.get(pace.key)?.term ?? 'Saved word',
    }))
    .slice(0, 6);
  const recallPace = recallPaceView === 'types'
    ? recallPaceByType
    : recallPaceByWord;
  const recallPaceAnswerCount = recallPaceByType.reduce(
    (total, pace) => total + pace.answerCount,
    0,
  );
  const recallSignalSummary = getQuizResponseSignalSummary(
    analytics,
    timeBasedLearningSettings,
  );
  const retrievalProfile = getQuizRetrievalProfile(
    analytics,
    timeBasedLearningSettings,
  );
  const totalSeconds =
    analytics.quizHistory.reduce(
      (total, attempt) => total + attempt.durationSeconds,
      0,
    ) +
    analytics.cardHistory.reduce(
      (total, event) => total + event.durationSeconds,
      0,
    );
  const mastery = words
    .map((word) => ({
      word,
      score: getWordMastery(word, analytics),
      category: getWordMasteryCategoryForWord(word, analytics),
    }))
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.word.term.localeCompare(second.word.term, undefined, {
          sensitivity: 'base',
        }),
  );
  const dueReviews = getDueReviewWords(words, analytics);
  const queuedDueReviewWordIds = dueReviews
    .filter((item) => item.word.mastery?.reviewNext === true)
    .map((item) => item.word.id);
  const queuedDueReviewWordIdSet = new Set(queuedDueReviewWordIds);
  const dueReviewPageCount = Math.max(
    1,
    Math.ceil(dueReviews.length / EXPANDED_LIST_PAGE_SIZE),
  );
  const currentDueReviewPage = Math.min(
    dueReviewPage,
    dueReviewPageCount - 1,
  );
  const dueReviewStartIndex = currentDueReviewPage * EXPANDED_LIST_PAGE_SIZE;
  const dueReviewPreview = dueReviewsExpanded
    ? dueReviews.slice(
        dueReviewStartIndex,
        dueReviewStartIndex + EXPANDED_LIST_PAGE_SIZE,
      )
    : dueReviews.slice(0, DUE_REVIEW_PREVIEW_SIZE);

  function handleDueReviewPress(wordId: string) {
    const pendingTap = pendingDueReviewTap.current;
    if (pendingTap?.wordId === wordId) {
      clearTimeout(pendingTap.timeout);
      pendingDueReviewTap.current = null;
      onToggleWordFocus(wordId);
      return;
    }

    if (pendingTap) {
      clearTimeout(pendingTap.timeout);
      onToggleWordReviewNext(pendingTap.wordId);
    }

    pendingDueReviewTap.current = {
      wordId,
      timeout: setTimeout(() => {
        onToggleWordReviewNext(wordId);
        pendingDueReviewTap.current = null;
      }, 250),
    };
  }

  useEffect(
    () => () => {
      if (pendingDueReviewTap.current) {
        clearTimeout(pendingDueReviewTap.current.timeout);
      }
    },
    [],
  );

  function startDueReview() {
    onReviewDue(queuedDueReviewWordIds);
  }
  const masteryPageCount = Math.max(
    1,
    Math.ceil(mastery.length / EXPANDED_LIST_PAGE_SIZE),
  );
  const currentMasteryPage = Math.min(masteryPage, masteryPageCount - 1);
  const masteryStartIndex = currentMasteryPage * EXPANDED_LIST_PAGE_SIZE;
  const masteryRangeEnd = Math.min(
    masteryStartIndex + EXPANDED_LIST_PAGE_SIZE,
    mastery.length,
  );
  const masteryPreview = masteryExpanded
    ? mastery.slice(
        masteryStartIndex,
        masteryStartIndex + EXPANDED_LIST_PAGE_SIZE,
      )
    : mastery.slice(0, 7);
  const overallMastery = words.length
    ? Math.round(
        mastery.reduce((total, item) => total + item.score, 0) / words.length,
      )
    : 0;
  const masteryLevel = getMasteryLevel(overallMastery);
  const nextMasteryLevel = getNextMasteryLevel(overallMastery);
  const masteryLevelProgress = getMasteryLevelProgress(overallMastery);
  const masteryRingSegments = buildMasteryRingSegments(
    words.length ? overallMastery : 0,
  );
  const masteredWords = mastery.filter((item) => item.category.id === 'master').length;
  const strongWords = mastery.filter((item) => item.category.id === 'strong').length;
  const buildingWords = mastery.filter((item) => item.category.id === 'building').length;
  const learningWords = Math.max(
    0,
    words.length - masteredWords - strongWords - buildingWords,
  );
  const remainingReviews = mastery.reduce(
    (total, item) =>
      total + (item.score >= 80 ? 0 : Math.ceil((80 - item.score) / 14)),
    0,
  );
  const estimatedMinutes = remainingReviews
    ? Math.max(1, Math.ceil((remainingReviews * 20) / 60))
    : 0;
  const typicalQuizSize = Math.max(1, Math.min(words.length, 10));
  const estimatedQuizCount = remainingReviews
    ? Math.max(1, Math.ceil(remainingReviews / typicalQuizSize))
    : 0;
  const weeklyActivity = recentDays.map((day) => {
    const dayCardEvents = analytics.cardHistory.filter(
      (event) => event.date === day.key,
    );
    const dayQuizAttempts = analytics.quizHistory.filter(
      (attempt) => attempt.date === day.key,
    );
    const dayTestAttempts = dayQuizAttempts.filter((attempt) =>
      attempt.answers.some(
        (answer) =>
          answer.sessionMode === 'omega-test' ||
          answer.sessionMode === 'mastery-test',
      ),
    );
    const studySeconds =
      dayCardEvents.reduce(
        (total, event) => total + event.durationSeconds,
        0,
      ) +
      dayQuizAttempts.reduce(
        (total, attempt) => total + attempt.durationSeconds,
        0,
      );
    const quizQuestionCount = dayQuizAttempts.reduce(
      (total, attempt) => total + attempt.total,
      0,
    );
    const activityCount = dayCardEvents.length + quizQuestionCount;

    return {
      ...day,
      activityCount,
      quizCount: dayQuizAttempts.length - dayTestAttempts.length,
      testCount: dayTestAttempts.length,
      studySeconds,
      dailyProgress: getDailyActivityProgress(studySeconds, dayQuizAttempts.length),
    };
  });
  const weeklyActivityTotal = weeklyActivity.reduce(
    (total, day) => total + day.activityCount,
    0,
  );
  const recentQuizzes = analytics.quizHistory.slice(0, 5);
  const quizTrendPageCount = Math.max(
    1,
    Math.ceil(analytics.quizHistory.length / QUIZ_TREND_PAGE_SIZE),
  );
  const currentQuizTrendPage = Math.min(
    quizTrendPage,
    quizTrendPageCount - 1,
  );
  const quizTrendAttempts = quizTrendExpanded
    ? analytics.quizHistory.slice(
        currentQuizTrendPage * QUIZ_TREND_PAGE_SIZE,
        (currentQuizTrendPage + 1) * QUIZ_TREND_PAGE_SIZE,
      )
    : recentQuizzes;
  const streakStats = calculateStreakStats(analytics);
  const streak = streakStats.current;
  const recentStreakLengths = getRecentStreakLengths(streakStats);
  const streakMilestone = getStreakMilestone(streakStats);
  const streakWeek = getStreakWeek(streakStats);
  const achievements = buildAchievements({ words, analytics, streakStats });
  const achievementPageCount = Math.max(
    1,
    Math.ceil(achievements.length / ACHIEVEMENT_PAGE_SIZE),
  );
  const currentAchievementPage = Math.min(
    achievementPage,
    achievementPageCount - 1,
  );
  const pagedAchievements = achievements.slice(
    currentAchievementPage * ACHIEVEMENT_PAGE_SIZE,
    (currentAchievementPage + 1) * ACHIEVEMENT_PAGE_SIZE,
  );
  const unlockedAchievements = achievements.filter(
    (achievement) => achievement.unlocked,
  ).length;
  const achievementPreview = [
    ...achievements.filter((achievement) => achievement.unlocked),
    ...achievements.filter((achievement) => !achievement.unlocked),
  ].slice(0, 4);
  const reminderTime = formatReminderTime(reminderSettings);
  const updateReminderTime = (hour: number, minute: number) => {
    const nextTime = normalizeReminderTime(hour, minute);
    onUpdateReminder({
      ...reminderSettings,
      enabled: true,
      hour: nextTime.hour,
      minute: nextTime.minute,
    });
  };
  async function restoreSubscription() {
    const result = await subscription.restore();
    if (result.status === 'restored') {
      Alert.alert('WordWiz Plus restored', 'Your Plus learning tools are ready.');
      return;
    }
    if (result.status === 'not-found') {
      Alert.alert('No active subscription found', 'We could not find an active WordWiz Plus subscription for this Apple ID.');
      return;
    }
    Alert.alert('Could not restore purchases', result.message);
  }

  async function manageSubscription() {
    try {
      await subscription.manageSubscription();
    } catch {
      Alert.alert(
        'Subscription settings unavailable',
        'Apple subscription settings are unavailable right now. Please try again shortly.',
      );
    }
  }

  const collapseMasteryListOnDoubleTap = () => {
    if (!masteryExpanded) return;

    const tappedAt = Date.now();
    if (tappedAt - lastMasteryRowTapAt.current < 340) {
      lastMasteryRowTapAt.current = 0;
      setMasteryExpanded(false);
      return;
    }

    lastMasteryRowTapAt.current = tappedAt;
  };

  const collapseAchievementsOnDoubleTap = () => {
    if (!achievementsExpanded) return;

    const tappedAt = Date.now();
    if (tappedAt - lastAchievementTapAt.current < 340) {
      lastAchievementTapAt.current = 0;
      setAchievementsExpanded(false);
      return;
    }

    lastAchievementTapAt.current = tappedAt;
  };

  const collapseQuizTrendOnDoubleTap = () => {
    if (!quizTrendExpanded) return;

    const tappedAt = Date.now();
    if (tappedAt - lastQuizTrendTapAt.current < 340) {
      lastQuizTrendTapAt.current = 0;
      setQuizTrendExpanded(false);
      return;
    }

    lastQuizTrendTapAt.current = tappedAt;
  };

  useEffect(() => {
    const sparkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(masterSparkleScale, {
          toValue: 1.16,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(masterSparkleScale, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ]),
    );

    sparkleLoop.start();

    return () => sparkleLoop.stop();
  }, [masterSparkleScale]);

  const practiceEstimate = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Practice estimate details"
      accessibilityHint="Shows the reviews, quizzes, and study time behind this estimate"
      accessibilityState={{ expanded: practiceEstimateExpanded }}
      onPress={() => setPracticeEstimateExpanded((expanded) => !expanded)}
      style={({ pressed }) => [styles.insightCard, pressed && styles.pressed]}
    >
      <View style={styles.insightHeader}>
        <View style={styles.insightIcon}>
          <Ionicons name="sparkles" size={23} color={COLORS.blue} />
        </View>
        <View style={styles.insightCopy}>
          <Text style={styles.insightLabel}>PRACTICE ESTIMATE</Text>
          <Text style={styles.insightTitle}>
            {words.length === 0
              ? 'Start with a few words'
              : remainingReviews === 0
                ? 'Your words are in great shape'
                : `About ${estimatedMinutes} ${estimatedMinutes === 1 ? 'minute' : 'minutes'} studying flashcards`}
          </Text>
          <Text style={styles.insightText}>
            {words.length === 0
              ? 'Add words and practice them to unlock a learning estimate.'
              : remainingReviews === 0
                ? 'Keep using them naturally to help the meanings last.'
                : 'A personalized estimate to strengthen your saved words.'}
          </Text>
        </View>
        <View style={styles.insightChevron}>
          <Ionicons
            name={practiceEstimateExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={COLORS.blue}
          />
        </View>
      </View>
      {practiceEstimateExpanded && words.length > 0 ? (
        <View style={styles.insightDetails}>
          <PracticeEstimateDetail
            icon="layers-outline"
            title={`${remainingReviews} review${remainingReviews === 1 ? '' : 's'} left`}
            text="Short, repeated recall sessions move words toward the strong zone."
          />
          <PracticeEstimateDetail
            icon="help-circle-outline"
            title={`About ${estimatedQuizCount} ${estimatedQuizCount === 1 ? 'quiz' : 'quizzes'}`}
            text={`Based on quizzes of about ${typicalQuizSize} ${typicalQuizSize === 1 ? 'word' : 'words'} each.`}
          />
          <PracticeEstimateDetail
            icon="time-outline"
            title={`About ${estimatedMinutes} ${estimatedMinutes === 1 ? 'minute' : 'minutes'} of flashcard study`}
            text="Based on roughly 20 seconds per flashcard review."
          />
        </View>
      ) : null}
    </Pressable>
  );

  const wordMasterySection = (
    <DashboardSection title="WORD MASTERY" badge={`${words.length} words`}>
      {mastery.length === 0 ? (
        <Text style={styles.dashboardEmptyText}>
          Add your first word to start measuring mastery.
        </Text>
      ) : (
        <>
          {masteryExpanded ? (
            <Text style={styles.expandedListHint}>Double-tap any word to show fewer</Text>
          ) : null}
          {masteryPreview.map((item) => {
            const wordCategory = item.category;
            const isMasterWord = wordCategory.id === 'master';

            return (
              <Pressable
                key={item.word.id}
                accessibilityRole={masteryExpanded ? 'button' : undefined}
                accessibilityHint={
                  masteryExpanded
                    ? 'Double-tap twice quickly to collapse the word list'
                    : undefined
                }
                disabled={!masteryExpanded}
                onPress={collapseMasteryListOnDoubleTap}
                style={[
                  styles.masteryRow,
                  isMasterWord && styles.masteryRowComplete,
                ]}
              >
                <View style={styles.masteryRowTop}>
                  <View style={styles.masteryWordCopy}>
                    <Text style={styles.masteryWord}>{item.word.term}</Text>
                    <Text style={[styles.masteryWordLevel, { color: wordCategory.color }]}>
                      {isMasterWord
                        ? wordCategory.shortLabel
                        : getMasteryLevel(item.score).shortTitle}
                    </Text>
                  </View>
                  <View style={styles.masteryPercentRow}>
                    {isMasterWord ? (
                      <Animated.View
                        style={[
                          styles.masteryCompleteSparkle,
                          { transform: [{ scale: masterSparkleScale }] },
                        ]}
                      >
                        <Ionicons name="sparkles" size={15} color="#D39A16" />
                        <Ionicons
                          name="star"
                          size={6}
                          color="#F4C866"
                          style={styles.masteryCompleteSparkleMini}
                        />
                      </Animated.View>
                    ) : null}
                    <Text style={[styles.masteryPercent, { color: wordCategory.color }]}>
                      {item.score}%
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.masteryTrack,
                    isMasterWord && { backgroundColor: wordCategory.pale },
                  ]}
                >
                  <ProgressFill
                    color={wordCategory.color}
                    progress={Math.max(item.score, 3)}
                    radius={5}
                    variant={isMasterWord ? 'main' : 'standard'}
                    style={{ width: `${Math.max(item.score, 3)}%` }}
                  />
                </View>
              </Pressable>
            );
          })}
          {masteryExpanded && masteryPageCount > 1 ? (
            <CompactPagination
              page={currentMasteryPage}
              pageCount={masteryPageCount}
              pageSize={EXPANDED_LIST_PAGE_SIZE}
              total={mastery.length}
              itemLabel="word mastery rows"
              onPrevious={() => setMasteryPage(Math.max(0, currentMasteryPage - 1))}
              onNext={() => setMasteryPage(Math.min(masteryPageCount - 1, currentMasteryPage + 1))}
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              masteryExpanded ? 'Show fewer word mastery rows' : 'Show all word mastery rows'
            }
            accessibilityState={{ expanded: masteryExpanded }}
            onPress={() => {
              if (masteryExpanded) {
                setMasteryExpanded(false);
                return;
              }

              setMasteryPage(0);
              setMasteryExpanded(true);
            }}
            style={({ pressed }) => [styles.masterySummary, pressed && styles.pressed]}
          >
            <View style={styles.masterySummaryCopy}>
              <Text style={styles.masterySummaryTitle}>
                {masteryExpanded
                  ? `Showing ${masteryStartIndex + 1}–${masteryRangeEnd} of ${mastery.length} words`
                  : 'Showing top words'}
              </Text>
              <Text style={styles.masterySummaryText}>
                {masteredWords} proficient · {strongWords} strong · {buildingWords} building
              </Text>
            </View>
            <Text style={styles.masterySummaryAction}>
              {masteryExpanded ? 'Collapse' : 'View all'}
            </Text>
            <Ionicons
              name={masteryExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={COLORS.muted}
            />
          </Pressable>
        </>
      )}
    </DashboardSection>
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.dashboardContent}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="YOUR PROGRESS"
        title="Learning dashboard"
        subtitle="Small sessions add up. Here’s the story your practice tells."
      />

      {practiceEstimate}

      <View style={styles.dashboardHero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroLabel}>ESTIMATED MASTERY</Text>
          <Text style={styles.heroLevelTitle}>{masteryLevel.title}</Text>
          <Text style={styles.heroValue}>{masteryLevelProgress}%</Text>
          <Text style={styles.heroText}>
            {masteryLevel.encouragement}
          </Text>
          <View style={styles.heroLevelTrack}>
            <ProgressFill
              color={getHeroProgressColor(masteryLevelProgress)}
              progress={Math.max(masteryLevelProgress, words.length ? 6 : 0)}
              radius={4}
              style={{ width: `${Math.max(masteryLevelProgress, words.length ? 6 : 0)}%` }}
              variant="hero"
            />
          </View>
          <Text style={styles.heroLevelNext}>
            {nextMasteryLevel
              ? `${nextMasteryLevel.minScore - overallMastery} pts to ${nextMasteryLevel.shortTitle}`
              : 'Top rank reached'}
          </Text>
        </View>
        <LessonProgressRing
          progress={masteryLevelProgress}
          masteryScore={words.length ? overallMastery : 0}
          lessonTitle={`TO ${nextMasteryLevel?.shortTitle.toUpperCase() ?? 'TOP'}`}
        />
      </View>
      <View style={styles.masteryLevelLegend}>
        {masteryRingSegments.map((segment) => (
          <View
            key={segment.shortTitle}
            style={[
              styles.masteryLevelLegendItem,
              segment.isCurrent && styles.masteryLevelLegendItemActive,
            ]}
          >
            <View
              style={[
                styles.masteryLevelLegendDot,
                { backgroundColor: segment.color },
              ]}
            />
            <Text
              style={[
                styles.masteryLevelLegendText,
                segment.isCurrent && styles.masteryLevelLegendTextActive,
              ]}
            >
              {segment.shortTitle}
            </Text>
          </View>
        ))}
      </View>

    <View style={styles.statGrid}>
      <DashboardStat
        icon="time"
        color={COLORS.blue}
        background="#F3F7FF"
        value={formatStudyTime(totalSeconds)}
        label="Study time"
      />
      <DashboardStat
        icon="trophy"
        color={COLORS.orange}
        background="#FFF7EB"
        value={`${analytics.quizHistory.length}`}
        label="Quizzes"
      />
      <DashboardStat
        icon="close-circle"
        color={COLORS.red}
        background="#FFF5F8"
        value={`${totalWrong}`}
        label="Missed"
      />
      <StreakHistoryStat current={streak} recent={recentStreakLengths} />
      </View>

      <View style={styles.streakReminderGrid}>
        <View style={styles.streakCard}>
          <View pointerEvents="none" style={styles.streakMagicAura} />
          <View pointerEvents="none" style={styles.streakMagicGoldAura} />
          <View pointerEvents="none" style={styles.streakSparkleLayer}>
            <Animated.View
              style={[
                styles.streakSparkleLarge,
                {
                  opacity: streakSparklePulse,
                  transform: [{ translateY: streakSparkleFloat }],
                },
              ]}
            >
              <Ionicons name="sparkles" size={18} color="#E2AF2F" />
            </Animated.View>
            <Animated.View
              style={[
                styles.streakSparkleSmall,
                {
                  opacity: streakSparklePulse,
                  transform: [{ translateY: Animated.multiply(streakSparkleFloat, -0.55) }],
                },
              ]}
            >
              <Ionicons name="sparkles" size={11} color="#F4C866" />
            </Animated.View>
            <Animated.View
              style={[
                styles.streakSparkleTiny,
                {
                  opacity: streakSparklePulse,
                  transform: [{ translateY: Animated.multiply(streakSparkleFloat, 0.4) }],
                },
              ]}
            >
              <Ionicons name="star" size={8} color="#FFE7A1" />
            </Animated.View>
            <Animated.View
              style={[
                styles.streakSparkleGold,
                {
                  opacity: streakSparklePulse,
                  transform: [{ translateY: Animated.multiply(streakSparkleFloat, -0.3) }],
                },
              ]}
            >
              <Ionicons name="sparkles" size={10} color="#E2AF2F" />
            </Animated.View>
          </View>
          <View style={styles.streakCardHeader}>
            <View style={styles.streakFlame}>
              <Ionicons name="sparkles" size={25} color={COLORS.white} />
              <Ionicons name="star" size={7} color="#FFE58A" style={styles.streakFlameStar} />
            </View>
            <View style={styles.streakHeaderCopy}>
              <Text style={styles.streakLabel}>STREAKS</Text>
              <Text style={styles.streakTitle}>{streakMilestone.title}</Text>
            </View>
            <View style={styles.streakSummary}>
              <View style={styles.streakSummaryMetric}>
                <View style={styles.streakCurrentIcon}>
                  <Ionicons name="sparkles" size={13} color="#C88612" />
                </View>
                <View>
                  <Text style={styles.streakMetricValue}>{streakStats.current}d</Text>
                  <Text style={styles.streakMetricLabel}>Current</Text>
                </View>
              </View>
              <View style={styles.streakSummaryDivider} />
              <View style={styles.streakSummaryMetric}>
                <View style={styles.streakBestIcon}>
                  <Ionicons name="trophy" size={12} color="#B48700" />
                </View>
                <View>
                  <Text style={styles.streakMetricValue}>{streakStats.longest}d</Text>
                  <Text style={styles.streakMetricLabel}>Best</Text>
                </View>
              </View>
            </View>
          </View>
          <Text style={styles.streakMessage}>
            {getStreakMessage(streakStats)} {streakMilestone.description}
          </Text>
          <View style={styles.streakWeek}>
            {streakWeek.map((day) => (
              <StreakDay key={day.key} day={day} />
            ))}
          </View>
        </View>

      </View>

      <DashboardSection
        title={`LAST ${activityWindow} DAYS`}
        badge={`${weeklyActivityTotal} activities`}
      >
        <View style={styles.activityRangeControl}>
          {([7, 30] as const).map((range) => (
            <Pressable
              key={range}
              accessibilityRole="button"
              accessibilityLabel={`Show last ${range} days`}
              accessibilityState={{ selected: activityWindow === range }}
              onPress={() => setActivityWindow(range)}
              style={[
                styles.activityRangeButton,
                activityWindow === range && styles.activityRangeButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.activityRangeButtonText,
                  activityWindow === range &&
                    styles.activityRangeButtonTextActive,
                ]}
              >
                {range}D
              </Text>
            </Pressable>
          ))}
        </View>

        {activityWindow === 30 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.barChart, styles.barChartWide]}
          >
            {weeklyActivity.map((day) => {
              const isToday = day.key === todayKey;

              return (
                <DailyActivityBar
                  key={day.key}
                  compact
                  day={day}
                  isToday={isToday}
                />
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.barChart}>
            {weeklyActivity.map((day) => {
              const isToday = day.key === todayKey;

              return (
                <DailyActivityBar
                  key={day.key}
                  day={day}
                  isToday={isToday}
                />
              );
            })}
          </View>
        )}
        <View style={styles.chartLegendRow}>
          <View style={styles.chartLegendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: COLORS.blue }]}
            />
            <Text style={styles.chartLegendText}>Past days</Text>
          </View>
          <View style={styles.chartLegendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: COLORS.green }]}
            />
            <Text style={styles.chartLegendText}>Today</Text>
          </View>
          <View style={styles.chartLegendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: COLORS.yellow }]}
            />
            <Text style={styles.chartLegendText}>Quizzes</Text>
          </View>
          <View style={styles.chartLegendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: COLORS.purple }]}
            />
            <Text style={styles.chartLegendText}>Tests</Text>
          </View>
        </View>
      </DashboardSection>

      <View style={styles.dashboardSplit}>
        <View style={styles.accuracyCard}>
          <Text style={styles.dashboardCardLabel}>QUIZ ACCURACY</Text>
          <View style={styles.accuracyGauge}>
            <QuizAccuracyRing
              accuracy={accuracy}
              state={hasQuizAnswers ? (hasNoCorrectAnswers ? 'zero' : 'scored') : 'empty'}
            />
            <View
              style={[
                styles.accuracyGaugeInner,
                !hasQuizAnswers && styles.accuracyGaugeInnerEmpty,
              ]}
            >
              {hasQuizAnswers ? (
                <Text style={styles.accuracyValue}>{accuracy}%</Text>
              ) : (
                <Ionicons name="sparkles" size={22} color={COLORS.purpleDark} />
              )}
              <Text
                style={[
                  styles.accuracyLabel,
                  !hasQuizAnswers && styles.accuracyLabelReady,
                  hasNoCorrectAnswers && styles.accuracyLabelEncouraging,
                ]}
              >
                {hasQuizAnswers
                  ? hasNoCorrectAnswers
                    ? 'KEEP GOING'
                    : 'CORRECT'
                  : 'READY'}
              </Text>
            </View>
          </View>
          <Text style={styles.accuracyDetail}>
            {hasQuizAnswers ? (
              <>
                <Text style={styles.accuracyDetailCorrect}>{totalCorrect} correct</Text>
                <Text> · </Text>
                <Text style={styles.accuracyDetailMissed}>{totalWrong} to revisit</Text>
              </>
            ) : (
              <Text style={styles.accuracyDetailReady}>Take a quiz to begin</Text>
            )}
          </Text>
        </View>

        <View style={styles.distributionCard}>
          <Text style={styles.dashboardCardLabel}>WORD LEVELS</Text>
          <View style={styles.levelStack}>
            <LevelRow
              color={getWordMasteryCategory(100).color}
              label="Proficient words"
              value={masteredWords}
              sparkly
            />
            <LevelRow
              color={getWordMasteryCategory(80).color}
              label="Strong words"
              value={strongWords}
            />
            <LevelRow
              color={getWordMasteryCategory(40).color}
              label="Building words"
              value={buildingWords}
            />
            <LevelRow
              color={getWordMasteryCategory(0).color}
              label="Learning words"
              value={learningWords}
            />
          </View>
          <WordLevelDistributionBar
            buildingWords={buildingWords}
            learningWords={learningWords}
            proficientWords={masteredWords}
            strongWords={strongWords}
          />
        </View>
      </View>

      {wordMasterySection}

      <DashboardSection
        title="RETRIEVAL PROFILE"
        badge={retrievalProfile.totalAnswers ? `${retrievalProfile.recallPercent}% recall` : 'New'}
      >
        <Text style={styles.retrievalProfileIntro}>
          Recognition builds familiarity, but recall is the stronger sign that a word is becoming part of your memory.
        </Text>
        {retrievalProfile.totalAnswers === 0 ? (
          <View style={styles.feedbackEmpty}>
            <Ionicons name="bulb-outline" size={21} color={COLORS.purpleDark} />
            <Text style={styles.feedbackEmptyText}>
              Complete a few quiz questions to see how much of your evidence comes from recognition versus recall.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.retrievalProfileSplit}>
              <RetrievalEvidenceCard
                label="Recognition"
                value={retrievalProfile.recognitionPercent}
                detail="Familiarity · may use cues or quiz patterns"
                color={COLORS.blue}
                pale="#EAF3FF"
              />
              <RetrievalEvidenceCard
                label="Recall"
                value={retrievalProfile.recallPercent}
                detail="Retrieval · bring the meaning back from memory"
                color={COLORS.greenDark}
                pale="#E8FBF4"
              />
            </View>
            <View style={styles.retrievalEvidenceRow}>
              <Ionicons name="key-outline" size={17} color={COLORS.purpleDark} />
              <Text style={styles.retrievalEvidenceText}>
                {retrievalProfile.directRecallCorrect} answers recalled without choices · {retrievalProfile.delayedDirectRecallCorrect} still recalled a day later
              </Text>
            </View>
          </>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How WordWiz builds retrieval"
          accessibilityHint={
            isRetrievalProgressionExpanded
              ? 'Hides the six-step retrieval path.'
              : 'Shows the six-step retrieval path.'
          }
          accessibilityState={{ expanded: isRetrievalProgressionExpanded }}
          onPress={() => setIsRetrievalProgressionExpanded((current) => !current)}
          style={({ pressed }) => [
            styles.retrievalProgression,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.retrievalProgressionHeader}>
            <View style={styles.retrievalProgressionHeaderCopy}>
              <Text style={styles.retrievalProgressionTitle}>
                HOW WORDWIZ BUILDS RETRIEVAL
              </Text>
              <Text style={styles.retrievalProgressionSummary}>
                6 steps from recognition to recall
              </Text>
            </View>
            <View style={styles.retrievalProgressionChevron}>
              <Ionicons
                name={
                  isRetrievalProgressionExpanded
                    ? 'chevron-up'
                    : 'chevron-down'
                }
                size={17}
                color={COLORS.purpleDark}
              />
            </View>
          </View>
          {isRetrievalProgressionExpanded ? (
            <View style={styles.retrievalProgressionSteps}>
              {RETRIEVAL_PROGRESSION_STEPS.map((step, index) => (
                <View key={step} style={styles.retrievalProgressionStep}>
                  <View style={styles.retrievalProgressionNumber}>
                    <Text style={styles.retrievalProgressionNumberText}>
                      {index + 1}
                    </Text>
                  </View>
                  <Text style={styles.retrievalProgressionText}>{step}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      </DashboardSection>

      <DashboardSection
        title="RECALL FEEDBACK"
        badge={feedbackSummary.total ? `${feedbackSummary.total} check-ins` : 'New'}
      >
        <Text style={styles.feedbackIntro}>
          Your check-ins after correct answers help tailor the next review.
        </Text>
        <View style={styles.feedbackViewToggle}>
          {([
            ['overall', 'Overall'],
            ['words', 'By word'],
          ] as const).map(([view, label]) => (
            <Pressable
              key={view}
              accessibilityRole="button"
              accessibilityState={{ selected: feedbackView === view }}
              onPress={() => setFeedbackView(view)}
              style={[
                styles.feedbackViewToggleButton,
                feedbackView === view && styles.feedbackViewToggleButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.feedbackViewToggleText,
                  feedbackView === view && styles.feedbackViewToggleTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {feedbackSummary.total === 0 ? (
          <View style={styles.feedbackEmpty}>
            <Ionicons name="chatbubble-ellipses-outline" size={21} color={COLORS.purpleDark} />
            <Text style={styles.feedbackEmptyText}>
              After a correct quiz answer, choose Hard, Got it, or Easy to see your learning pattern here.
            </Text>
          </View>
        ) : feedbackView === 'overall' ? (
          <View style={styles.feedbackOverviewCard}>
            <FeedbackDistribution summary={feedbackSummary} />
          </View>
        ) : (
          <View style={styles.feedbackWordList}>
            {feedbackByWord.map((feedback) => (
              <View key={feedback.wordId} style={styles.feedbackWordRow}>
                <View style={styles.feedbackWordHeader}>
                  <Text numberOfLines={1} style={styles.feedbackWordName}>
                    {feedback.term}
                  </Text>
                  <Text style={styles.feedbackWordTotal}>
                    {feedback.total} {feedback.total === 1 ? 'check-in' : 'check-ins'}
                  </Text>
                </View>
                <FeedbackDistribution summary={feedback} compact />
              </View>
            ))}
          </View>
        )}
      </DashboardSection>

      <DashboardSection
        title="RECALL PACE"
        badge={recallPaceAnswerCount ? `${recallPaceAnswerCount} responses` : 'New'}
      >
        <Text style={styles.recallPaceIntro}>
          Accuracy comes first. Pace is recorded for every answer and helps choose the next review.
        </Text>
        {recallSignalSummary.total > 0 ? (
          <RecallSignalDistribution
            summary={recallSignalSummary}
            settings={timeBasedLearningSettings}
          />
        ) : null}
        <View style={styles.feedbackViewToggle}>
          {([
            ['types', 'Question type'],
            ['words', 'By word'],
          ] as const).map(([view, label]) => (
            <Pressable
              key={view}
              accessibilityRole="button"
              accessibilityState={{ selected: recallPaceView === view }}
              onPress={() => setRecallPaceView(view)}
              style={[
                styles.feedbackViewToggleButton,
                styles.recallPaceToggleButton,
                recallPaceView === view && styles.feedbackViewToggleButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.feedbackViewToggleText,
                  recallPaceView === view && styles.feedbackViewToggleTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {recallPace.length === 0 ? (
          <View style={styles.feedbackEmpty}>
            <Ionicons name="speedometer-outline" size={21} color={COLORS.blue} />
            <Text style={styles.feedbackEmptyText}>
              Complete a few quiz questions to see how quickly you recall each kind of prompt.
            </Text>
          </View>
        ) : (
          <RecallPaceList
            items={recallPace}
            view={recallPaceView}
          />
        )}
      </DashboardSection>

      <DashboardSection
        title="DUE FOR REVIEW"
        badge={dueReviews.length ? `${dueReviews.length} due` : 'All caught up'}
      >
        {dueReviews.length === 0 ? (
          <View style={styles.dueReviewEmpty}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.greenDark} />
            <View style={styles.dueReviewEmptyCopy}>
              <Text style={styles.dueReviewEmptyTitle}>You’re caught up</Text>
              <Text style={styles.dueReviewEmptyText}>
                Your next review will appear here.
              </Text>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.dueReviewIntro}>
              Research-backed, time-based retention learning schedules proven for stronger word retention.{"\n"}Tap for next up · Double-tap to focus
            </Text>
            {dueReviewPreview.map((item) => {
              const category = getWordMasteryCategoryForWord(
                item.word,
                analytics,
              );
              const lastReviewedLabel = formatLastReviewed(
                item.progress.lastReviewedAt,
              );
              const isQueued = queuedDueReviewWordIdSet.has(item.word.id);
              const isFocused = item.word.mastery?.focusMode === true;

              return (
                <Pressable
                  key={item.word.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isQueued
                      ? `Remove ${item.word.term} from the next review queue`
                      : `Move ${item.word.term} to the front of the next review. Double-tap to focus on it.`
                  }
                  accessibilityState={{ selected: isQueued }}
                  onPress={() => handleDueReviewPress(item.word.id)}
                  style={({ pressed }) => [
                    styles.dueReviewRow,
                    isQueued && styles.dueReviewRowQueued,
                    isFocused && styles.dueReviewRowFocused,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.dueReviewIcon,
                      { backgroundColor: category.pale },
                    ]}
                  >
                    <Ionicons name="time-outline" size={16} color={category.color} />
                  </View>
                  <View style={styles.dueReviewCopy}>
                    <Text numberOfLines={1} style={styles.dueReviewWord}>
                      {item.word.term}
                    </Text>
                    <Text style={[styles.dueReviewStatus, { color: category.color }]}>
                      {category.shortLabel} · {lastReviewedLabel}
                    </Text>
                  </View>
                  {isFocused ? (
                    <View style={styles.dueReviewFocusedTiming}>
                      <View style={styles.dueReviewFocusedLabel}>
                        <Ionicons name="flame" size={11} color="#B78300" />
                        <Text style={styles.dueReviewFocusedText}>FOCUS</Text>
                      </View>
                      <Text style={styles.dueReviewTiming}>
                        {isQueued ? 'NEXT UP' : item.timingLabel}
                      </Text>
                    </View>
                  ) : isQueued ? (
                    <View style={styles.dueReviewQueuedLabel}>
                      <Ionicons name="arrow-up" size={12} color={COLORS.purpleDark} />
                      <Text style={styles.dueReviewQueuedText}>NEXT UP</Text>
                    </View>
                  ) : (
                    <Text style={styles.dueReviewTiming}>{item.timingLabel}</Text>
                  )}
                </Pressable>
              );
            })}
            {dueReviewsExpanded && dueReviewPageCount > 1 ? (
              <CompactPagination
                page={currentDueReviewPage}
                pageCount={dueReviewPageCount}
                pageSize={EXPANDED_LIST_PAGE_SIZE}
                total={dueReviews.length}
                itemLabel="due review words"
                onPrevious={() => setDueReviewPage(Math.max(0, currentDueReviewPage - 1))}
                onNext={() =>
                  setDueReviewPage(
                    Math.min(dueReviewPageCount - 1, currentDueReviewPage + 1),
                  )
                }
              />
            ) : null}
            <View style={styles.dueReviewActions}>
              {dueReviews.length > DUE_REVIEW_PREVIEW_SIZE ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: dueReviewsExpanded }}
                  onPress={() => {
                    if (dueReviewsExpanded) {
                      setDueReviewsExpanded(false);
                      return;
                    }

                    setDueReviewPage(0);
                    setDueReviewsExpanded(true);
                  }}
                  style={({ pressed }) => [
                    styles.dueReviewViewAll,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.dueReviewViewAllText}>
                    {dueReviewsExpanded ? 'Show fewer' : 'View all'}
                  </Text>
                  <Ionicons
                    name={dueReviewsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={COLORS.purpleDark}
                  />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Review due words now"
                onPress={startDueReview}
                style={({ pressed }) => [
                  styles.dueReviewButton,
                  pressed && styles.primaryButtonPressed,
                ]}
              >
                <Ionicons name="play" size={14} color={COLORS.white} />
                <Text style={styles.dueReviewButtonText}>
                  {queuedDueReviewWordIds.length > 0
                    ? `REVIEW ${queuedDueReviewWordIds.length} NEXT`
                    : 'REVIEW NOW'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </DashboardSection>

      <DashboardSection
        title="FLAGGED WORDS"
      >
        <View style={styles.flaggedDashboardRow}>
          <View style={styles.flaggedDashboardIcon}>
            <Ionicons name="bookmark" size={20} color={COLORS.purpleDark} />
          </View>
          <View style={styles.flaggedDashboardCopy}>
            <Text style={styles.flaggedDashboardTitle}>
              {flaggedCount ? 'Extra practice, your way' : 'Save tricky words'}
            </Text>
            <Text style={styles.flaggedDashboardText}>
              {flaggedCount
                ? 'Study only the words you marked for another look.'
                : 'Flag a flashcard or quiz word to collect it here.'}
            </Text>
          </View>
          <Animated.View
            style={[
              styles.flaggedDashboardCount,
              { transform: [{ scale: flaggedCountScale }] },
            ]}
          >
            <Text style={styles.flaggedDashboardCountNumber}>{flaggedCount}</Text>
            <Text style={styles.flaggedDashboardCountLabel}>SAVED</Text>
          </Animated.View>
        </View>
        <View style={styles.flaggedDashboardActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Study flagged words with flashcards"
            disabled={flaggedCount === 0}
            onPress={onStudyFlaggedCards}
            style={[
              styles.flaggedDashboardButton,
              flaggedCount === 0 && styles.practiceButtonDisabled,
            ]}
          >
            <Ionicons name="albums-outline" size={15} color={COLORS.purpleDark} />
            <Text style={styles.flaggedDashboardButtonText}>CARDS</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Practice a quiz with flagged words"
            disabled={flaggedCount === 0}
            onPress={onStudyFlaggedQuiz}
            style={[
              styles.flaggedDashboardButton,
              flaggedCount === 0 && styles.practiceButtonDisabled,
            ]}
          >
            <Ionicons name="help-circle-outline" size={15} color={COLORS.purpleDark} />
            <Text style={styles.flaggedDashboardButtonText}>QUIZ</Text>
          </Pressable>
        </View>
        {(flaggedCount > 0 || recentlyUnflaggedWordIds.length > 0) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recentlyUnflaggedWordIds.length > 0 ? 'Undo unflag all words' : 'Unflag all saved words'}
            onPress={toggleAllFlags}
            style={({ pressed }) => [
              styles.flaggedDashboardBulkButton,
              recentlyUnflaggedWordIds.length > 0 && styles.flaggedDashboardBulkButtonUndo,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={recentlyUnflaggedWordIds.length > 0 ? 'arrow-undo-outline' : 'bookmark-outline'}
              size={15}
              color={COLORS.purpleDark}
            />
            <Text style={styles.flaggedDashboardBulkButtonText}>
              {recentlyUnflaggedWordIds.length > 0 ? 'UNDO' : 'UNFLAG ALL'}
            </Text>
          </Pressable>
        ) : null}
      </DashboardSection>

      <DashboardSection
        title="ACHIEVEMENTS"
        badge={`${unlockedAchievements}/${achievements.length} unlocked`}
      >
        <View style={styles.achievementRewardBar}>
          <View style={styles.achievementRewardItem}>
            <View style={[styles.achievementRewardIcon, styles.achievementRewardIconPoints]}>
              <Ionicons name="sparkles" size={15} color={COLORS.purpleDark} />
            </View>
            <View>
              <Text style={styles.achievementRewardValue}>{achievementPoints}</Text>
              <Text style={styles.achievementRewardLabel}>POINTS EARNED</Text>
            </View>
          </View>
          <View style={styles.achievementRewardDivider} />
          <View style={styles.achievementTokenVault}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.achievementTokenGlow,
                {
                  opacity: refreshTokenGlow,
                  transform: [{ scale: refreshTokenPulse }],
                },
              ]}
            />
            {refreshTokens > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.achievementTokenMagicSparkle,
                  {
                    opacity: refreshTokenGlow,
                    transform: [{ translateY: refreshTokenFloat }],
                  },
                ]}
              >
                <Ionicons name="sparkles" size={16} color="#D39A16" />
              </Animated.View>
            ) : null}
            <Animated.View
              style={[
                styles.achievementTokenIcon,
                {
                  transform: [
                    { translateY: refreshTokenFloat },
                    { scale: refreshTokenPulse },
                  ],
                },
              ]}
            >
              <Ionicons name="ticket" size={17} color={COLORS.white} />
              {refreshTokens > 0 ? (
                <View style={styles.achievementTokenSparkle}>
                  <Ionicons name="sparkles" size={9} color="#FFF2A7" />
                </View>
              ) : null}
            </Animated.View>
            <View style={styles.achievementTokenCopy}>
              <View style={styles.achievementTokenValueRow}>
                <Text style={styles.achievementTokenValue}>{refreshTokens}</Text>
                <Text style={styles.achievementTokenName}>
                  {refreshTokens === 1 ? 'MAGIC PASS' : 'MAGIC PASSES'}
                </Text>
              </View>
              <Text style={styles.achievementTokenLabel}>
                {refreshTokens > 0 ? 'UNLOCK DAILY + OMEGA' : 'EARN FROM ACHIEVEMENTS'}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            achievementsExpanded
              ? 'Collapse achievements'
              : 'Expand achievements'
          }
          accessibilityState={{ expanded: achievementsExpanded }}
          onPress={() => {
            if (achievementsExpanded) {
              setAchievementsExpanded(false);
              return;
            }
            setAchievementPage(0);
            setAchievementsExpanded(true);
          }}
          style={({ pressed }) => [
            styles.achievementSummary,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.achievementSummaryIcons}>
            {achievementPreview.map((achievement) => (
              <View
                key={achievement.id}
                style={[
                  styles.achievementSummaryIcon,
                  {
                    backgroundColor: achievement.unlocked
                      ? achievement.background
                      : COLORS.bluePale,
                  },
                ]}
              >
                <Ionicons
                  name={achievement.icon}
                  size={16}
                  color={achievement.unlocked ? achievement.color : COLORS.muted}
                />
              </View>
            ))}
          </View>
          <View style={styles.achievementSummaryCopy}>
            <Text style={styles.achievementSummaryTitle}>
              {achievementsExpanded ? 'Hide achievement details' : 'View achievement details'}
            </Text>
            <Text style={styles.achievementSummaryText}>
              {unlockedAchievements} unlocked · every milestone earns a refresh
            </Text>
          </View>
          <Ionicons
            name={achievementsExpanded ? 'chevron-up' : 'chevron-down'}
            size={19}
            color={COLORS.muted}
          />
        </Pressable>

        {achievementsExpanded ? (
          <>
            <Text style={styles.expandedListHint}>
              Double-tap any achievement to show fewer
            </Text>
            <View style={styles.achievementGrid}>
            {pagedAchievements.map((achievement) => {
            const percent = Math.round(
              (achievement.progress / achievement.target) * 100,
            );
            const fillColor = achievement.unlocked
              ? achievement.color
              : getProgressColor(percent);

            return (
              <Pressable
                key={achievement.id}
                accessibilityRole="button"
                accessibilityHint="Double-tap twice quickly to collapse the achievement list"
                onPress={collapseAchievementsOnDoubleTap}
                style={[
                  styles.achievementCard,
                  {
                    backgroundColor: achievement.unlocked
                      ? achievement.background
                      : getProgressPaleColor(percent),
                  },
                ]}
              >
                <View style={styles.achievementHeader}>
                  <View
                    style={[
                      styles.achievementIcon,
                      { backgroundColor: achievement.unlocked ? COLORS.white : COLORS.surface },
                    ]}
                  >
                    <Ionicons
                      name={achievement.icon}
                      size={18}
                      color={achievement.unlocked ? achievement.color : COLORS.muted}
                    />
                  </View>
                  <Text
                    style={[
                      styles.achievementStatus,
                      { color: achievement.unlocked ? achievement.color : COLORS.muted },
                    ]}
                  >
                    {achievement.unlocked ? `+${achievement.points} PTS` : `${achievement.progress}/${achievement.target}`}
                  </Text>
                </View>
                <Text style={styles.achievementTitle}>{achievement.title}</Text>
                <Text style={styles.achievementText}>
                  {achievement.description}
                </Text>
                <Text
                  style={[
                    styles.achievementRewardText,
                    { color: achievement.unlocked ? achievement.color : COLORS.muted },
                  ]}
                >
                  {achievement.unlocked
                    ? `DONE · +${achievement.refreshTokens} REFRESH`
                    : `REWARD · ${achievement.points} PTS + ${achievement.refreshTokens} REFRESH`}
                </Text>
                <View style={styles.achievementTrack}>
                  <ProgressFill
                    color={fillColor}
                    progress={Math.max(percent, achievement.progress ? 8 : 0)}
                    radius={4}
                    style={{ width: `${Math.max(percent, achievement.progress ? 8 : 0)}%` }}
                  />
                </View>
              </Pressable>
            );
          })}
            </View>
            {achievementPageCount > 1 ? (
              <CompactPagination
                page={currentAchievementPage}
                pageCount={achievementPageCount}
                pageSize={ACHIEVEMENT_PAGE_SIZE}
                total={achievements.length}
                itemLabel="achievements"
                onPrevious={() =>
                  setAchievementPage(Math.max(0, currentAchievementPage - 1))
                }
                onNext={() =>
                  setAchievementPage(
                    Math.min(achievementPageCount - 1, currentAchievementPage + 1),
                  )
                }
              />
            ) : null}
          </>
        ) : null}
      </DashboardSection>



        <View style={styles.reminderCard}>
          <View style={styles.reminderHeader}>
            <View style={styles.reminderIcon}>
              <Ionicons
                name="notifications"
                size={22}
                color={COLORS.blue}
              />
            </View>
            <View style={styles.reminderHeaderCopy}>
              <Text style={styles.reminderLabel}>DAILY REMINDER</Text>
              <Text style={styles.reminderTitle}>
                {reminderSettings.enabled ? reminderTime : 'Off'}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                onUpdateReminder({
                  ...reminderSettings,
                  enabled: !reminderSettings.enabled,
                })
              }
              style={[
                styles.reminderSwitch,
                reminderSettings.enabled && styles.reminderSwitchOn,
              ]}
            >
              <View
                style={[
                  styles.reminderSwitchKnob,
                  reminderSettings.enabled && styles.reminderSwitchKnobOn,
                ]}
              />
            </Pressable>
          </View>
          <Text style={styles.reminderText}>
            Smart reminders adapt to your streak, quiz goal, new words, and
            reviews.
          </Text>
          <View style={styles.reminderCustomTime}>
            <View style={styles.reminderCustomHeader}>
              <Text style={styles.reminderCustomLabel}>SET ANY TIME</Text>
              <Text style={styles.reminderCustomValue}>{reminderTime}</Text>
            </View>
            <View style={styles.reminderStepperRow}>
              <ReminderTimeStepper
                label="Hour"
                value={formatReminderHour(reminderSettings.hour)}
                onDecrease={() =>
                  updateReminderTime(
                    reminderSettings.hour - 1,
                    reminderSettings.minute,
                  )
                }
                onIncrease={() =>
                  updateReminderTime(
                    reminderSettings.hour + 1,
                    reminderSettings.minute,
                  )
                }
              />
              <ReminderTimeStepper
                label="Minute"
                value={formatReminderMinute(reminderSettings.minute)}
                onDecrease={() =>
                  updateReminderTime(
                    reminderSettings.hour,
                    reminderSettings.minute - 1,
                  )
                }
                onIncrease={() =>
                  updateReminderTime(
                    reminderSettings.hour,
                    reminderSettings.minute + 1,
                  )
                }
              />
            </View>
          </View>
          <Text style={styles.reminderQuickLabel}>QUICK PICKS</Text>
          <View style={styles.reminderTimes}>
            {[
              { label: '8 AM', hour: 8, minute: 0 },
              { label: '7 PM', hour: 19, minute: 0 },
              { label: '9 PM', hour: 21, minute: 0 },
            ].map((time) => (
              <ReminderTimeButton
                key={time.label}
                label={time.label}
                active={
                  reminderSettings.hour === time.hour &&
                  reminderSettings.minute === time.minute
                }
                onPress={() => updateReminderTime(time.hour, time.minute)}
              />
            ))}
          </View>
        </View>

      <View style={styles.dailyGoalCard}>
        <View style={styles.dailyGoalHeader}>
          <View style={styles.dailyGoalIcon}>
            <Ionicons name="trophy-outline" size={23} color={COLORS.teal} />
          </View>
          <View style={styles.dailyGoalCopy}>
            <Text style={styles.dailyGoalLabel}>DAILY PRACTICE</Text>
            <Text style={styles.dailyGoalTitle}>Quiz goal</Text>
          </View>
          <View style={styles.dailyGoalBadge}>
            <Text style={styles.dailyGoalBadgeText}>
              {dailyQuizGoal} {dailyQuizGoal === 1 ? 'quiz' : 'quizzes'}
            </Text>
          </View>
        </View>
        <Text style={styles.dailyGoalText}>
          Choose how many quizzes you want to complete each day. Every finished
          quiz counts, even when it has fewer than ten questions.
        </Text>
        <View style={styles.dailyGoalStepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease daily quiz goal"
            accessibilityState={{ disabled: dailyQuizGoal <= 1 }}
            disabled={dailyQuizGoal <= 1}
            onPress={() => onUpdateDailyQuizGoal(dailyQuizGoal - 1)}
            style={({ pressed }) => [
              styles.dailyGoalStepButton,
              dailyQuizGoal <= 1 && styles.dailyGoalStepButtonDisabled,
              pressed && dailyQuizGoal > 1 && styles.pressed,
            ]}
          >
            <Ionicons name="remove" size={21} color={COLORS.teal} />
          </Pressable>
          <View style={styles.dailyGoalValue}>
            <Text style={styles.dailyGoalNumber}>{dailyQuizGoal}</Text>
            <Text style={styles.dailyGoalUnit}>
              {dailyQuizGoal === 1 ? 'QUIZ PER DAY' : 'QUIZZES PER DAY'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase daily quiz goal"
            accessibilityState={{ disabled: dailyQuizGoal >= 5 }}
            disabled={dailyQuizGoal >= 5}
            onPress={() => onUpdateDailyQuizGoal(dailyQuizGoal + 1)}
            style={({ pressed }) => [
              styles.dailyGoalStepButton,
              dailyQuizGoal >= 5 && styles.dailyGoalStepButtonDisabled,
              pressed && dailyQuizGoal < 5 && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={21} color={COLORS.teal} />
          </Pressable>
        </View>
      </View>

      <View style={styles.quizPreferencesCard}>
        <View style={styles.quizPreferencesHeader}>
          <View style={styles.quizPreferencesIcon}>
            <Ionicons name="options-outline" size={20} color={COLORS.purpleDark} />
          </View>
          <View style={styles.quizPreferencesCopy}>
            <Text style={styles.quizPreferencesEyebrow}>LEARNING PREFERENCES</Text>
            <Text style={styles.quizPreferencesTitle}>Quiz difficulty & pace</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Quiz learning"
          accessibilityHint="Turn quiz sessions on or off"
          accessibilityState={{ checked: quizPreferences.enabled }}
          onPress={() =>
            onQuizPreferencesChange({
              ...quizPreferences,
              enabled: !quizPreferences.enabled,
            })
          }
          style={({ pressed }) => [
            styles.quizPreferenceToggle,
            quizPreferences.enabled && styles.quizPreferenceToggleActive,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.quizPreferenceToggleCopy}>
            <Text style={styles.quizPreferenceToggleTitle}>Quiz learning</Text>
            <Text style={styles.quizPreferenceToggleText}>
              {quizPreferences.enabled
                ? 'Sessions are ready when you are'
                : 'Paused — flashcards still work'}
            </Text>
          </View>
          <View style={[
            styles.timedLearningSwitch,
            quizPreferences.enabled && styles.timedLearningSwitchActive,
          ]}>
            <View style={[
              styles.timedLearningSwitchKnob,
              quizPreferences.enabled && styles.timedLearningSwitchKnobActive,
            ]} />
          </View>
        </Pressable>

        <Text style={styles.quizPreferenceLabel}>DEFAULT QUIZ DIFFICULTY</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quizPreferenceDifficultyScroller}
          contentContainerStyle={styles.quizPreferenceDifficultyRow}
        >
          {QUIZ_DIFFICULTY_OPTIONS.map((option) => {
            const active = quizPreferences.difficulty === option.id;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() =>
                  onQuizPreferencesChange({
                    ...quizPreferences,
                    difficulty: option.id,
                  })
                }
                style={({ pressed }) => [
                  styles.quizPreferenceDifficulty,
                  active && styles.quizPreferenceDifficultyActive,
                  option.id === 'ultra' && styles.quizPreferenceDifficultyUltra,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[
                  styles.quizPreferenceDifficultyText,
                  active && styles.quizPreferenceDifficultyTextActive,
                ]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.quizPreferenceHint}>
          Auto adapts to each word. Easy favors recognition; Hard and Ultra favor typed recall.
        </Text>

        <View style={styles.questionMixCard}>
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens controls for the question types WordWiz uses in quizzes"
            accessibilityState={{ expanded: isQuestionMixExpanded }}
            onPress={() => setIsQuestionMixExpanded((expanded) => !expanded)}
            style={({ pressed }) => [styles.questionMixHeader, pressed && styles.pressed]}
          >
            <View style={styles.questionMixHeaderContent}>
              <View style={styles.questionMixHeaderIcon}>
                <Ionicons name="shuffle" size={18} color={COLORS.purpleDark} />
              </View>
              <View style={styles.questionMixHeaderCopy}>
                <Text style={styles.quizPreferenceLabel}>QUESTION MIX</Text>
                <Text style={styles.questionMixSummary}>
                  {enabledQuestionTypeCount} types on · More appears about twice as often
                </Text>
              </View>
            </View>
            <View style={styles.questionMixAction}>
              <Text style={styles.questionMixActionText}>
                {isQuestionMixExpanded ? 'DONE' : 'EDIT'}
              </Text>
              <Ionicons
                name={isQuestionMixExpanded ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={COLORS.purpleDark}
              />
            </View>
          </Pressable>

          {isQuestionMixExpanded ? (
            <>
              <Text style={styles.questionMixHint}>
                Tap a type to see how it supports learning. Keep at least one type on; WordWiz still spaces prompts out when it can.
              </Text>
              {QUESTION_TYPE_OPTIONS.map((option) => {
                const preference = normalizedQuestionTypePreferences[option.id];
                const detailVisible = expandedQuestionType === option.id;
                const isOnlyEnabledType = preference.enabled && enabledQuestionTypeCount === 1;

                return (
                  <View
                    key={option.id}
                    style={[
                      styles.questionMixRow,
                      !preference.enabled && styles.questionMixRowDisabled,
                      detailVisible && styles.questionMixRowExpanded,
                    ]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${option.label} details`}
                      accessibilityState={{ expanded: detailVisible }}
                      onPress={() => setExpandedQuestionType(
                        detailVisible ? null : option.id,
                      )}
                      style={({ pressed }) => [styles.questionMixMain, pressed && styles.pressed]}
                    >
                      <View style={styles.questionMixIcon}>
                        <Ionicons name={option.icon} size={17} color={COLORS.purpleDark} />
                      </View>
                      <View style={styles.questionMixCopy}>
                        <Text style={styles.questionMixTitle}>{option.label}</Text>
                        <Text style={styles.questionMixStrength}>{option.strength}</Text>
                      </View>
                      <Ionicons
                        name={detailVisible ? 'chevron-up' : 'chevron-down'}
                        size={15}
                        color={COLORS.muted}
                      />
                    </Pressable>

                    <View style={styles.questionMixControls}>
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityLabel={`Use ${option.label} questions`}
                        accessibilityState={{ checked: preference.enabled, disabled: isOnlyEnabledType }}
                        disabled={isOnlyEnabledType}
                        onPress={() => onQuizPreferencesChange({
                          ...quizPreferences,
                          questionTypes: {
                            ...normalizedQuestionTypePreferences,
                            [option.id]: { ...preference, enabled: !preference.enabled },
                          },
                        })}
                        style={({ pressed }) => [
                          styles.questionMixToggle,
                          preference.enabled && styles.questionMixToggleActive,
                          isOnlyEnabledType && styles.questionMixControlDisabled,
                          pressed && !isOnlyEnabledType && styles.pressed,
                        ]}
                      >
                        <View style={[
                          styles.questionMixToggleKnob,
                          preference.enabled && styles.questionMixToggleKnobActive,
                        ]} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${option.label} frequency: ${preference.frequency === 'more' ? 'more often' : 'normal'}`}
                        accessibilityState={{ disabled: !preference.enabled }}
                        disabled={!preference.enabled}
                        onPress={() => onQuizPreferencesChange({
                          ...quizPreferences,
                          questionTypes: {
                            ...normalizedQuestionTypePreferences,
                            [option.id]: {
                              ...preference,
                              frequency: preference.frequency === 'more' ? 'normal' : 'more',
                            },
                          },
                        })}
                        style={({ pressed }) => [
                          styles.questionMixFrequency,
                          preference.frequency === 'more' && preference.enabled && styles.questionMixFrequencyActive,
                          !preference.enabled && styles.questionMixControlDisabled,
                          pressed && preference.enabled && styles.pressed,
                        ]}
                      >
                        <Text style={[
                          styles.questionMixFrequencyText,
                          preference.frequency === 'more' && preference.enabled && styles.questionMixFrequencyTextActive,
                        ]}>
                          {preference.frequency === 'more' ? 'MORE' : 'NORMAL'}
                        </Text>
                      </Pressable>
                    </View>

                    {detailVisible ? (
                      <View style={styles.questionMixDetail}>
                        <Text style={styles.questionMixDescription}>{option.description}</Text>
                        <View style={styles.questionMixReward}>
                          <Ionicons name="trending-up-outline" size={14} color={COLORS.teal} />
                          <Text style={styles.questionMixRewardText}>{option.mastery}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Time-based learning"
          accessibilityHint="Adds an optional fluency timer to strong words"
          accessibilityState={{ checked: timedLearningEnabled }}
          onPress={() => onTimedLearningChange(!timedLearningEnabled)}
          style={({ pressed }) => [
            styles.quizPreferenceToggle,
            timedLearningEnabled && styles.quizPreferenceToggleActive,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.quizPreferenceToggleCopy}>
            <Text style={styles.quizPreferenceToggleTitle}>Time-based learning</Text>
            <Text style={styles.quizPreferenceToggleText}>
              {timedLearningEnabled
                ? 'Fluency timer · no mastery penalty when time runs out'
                : 'Optional pace timer for strong and proficient words'}
            </Text>
          </View>
          <View style={[
            styles.timedLearningSwitch,
            timedLearningEnabled && styles.timedLearningSwitchActive,
          ]}>
            <View style={[
              styles.timedLearningSwitchKnob,
              timedLearningEnabled && styles.timedLearningSwitchKnobActive,
            ]} />
          </View>
        </Pressable>

        {timedLearningEnabled ? (
          <View style={[styles.timeBasedSettingsCard, styles.dashboardPaceCard]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isTimeSettingsExpanded }}
              onPress={() => setIsTimeSettingsExpanded((expanded) => !expanded)}
              style={({ pressed }) => [styles.timeBasedSettingsHeader, pressed && styles.pressed]}
            >
              <View style={styles.timeBasedSettingsHeaderCopy}>
                <Text style={styles.timeBasedSettingsEyebrow}>RECOMMENDED PACE</Text>
                <Text style={styles.timeBasedSettingsSummary}>
                  Choice {normalizedTimeSettings.multipleChoiceSeconds}s · Fill {normalizedTimeSettings.fillInSeconds}s · Type {normalizedTimeSettings.typedRecallSeconds}s
                </Text>
              </View>
              <Ionicons
                name={isTimeSettingsExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.purpleDark}
              />
            </Pressable>
            {isTimeSettingsExpanded ? (
              <>
                <Text style={styles.timeBasedSettingsNote}>
                  Under {FLUENT_RECALL_SECONDS}s is fluent recall. Correct answers still count when you take longer.
                </Text>
                {([
                  ['multipleChoiceSeconds', 'Multiple choice', 8, 30],
                  ['fillInSeconds', 'Fill in the blank', 12, 45],
                  ['typedRecallSeconds', 'Type the word', 15, 60],
                ] as const).map(([key, label, minimum, maximum]) => (
                  <View key={key} style={styles.timeBasedSettingRow}>
                    <Text style={styles.timeBasedSettingLabel}>{label}</Text>
                    <View style={styles.timeBasedSettingStepper}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Decrease ${label} time`}
                        onPress={() => onTimeBasedLearningSettingsChange({
                          ...normalizedTimeSettings,
                          [key]: Math.max(minimum, normalizedTimeSettings[key] - 1),
                        })}
                        style={({ pressed }) => [styles.timeBasedStepperButton, pressed && styles.pressed]}
                      >
                        <Ionicons name="remove" size={16} color={COLORS.purpleDark} />
                      </Pressable>
                      <Text style={styles.timeBasedSettingValue}>{normalizedTimeSettings[key]}s</Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Increase ${label} time`}
                        onPress={() => onTimeBasedLearningSettingsChange({
                          ...normalizedTimeSettings,
                          [key]: Math.min(maximum, normalizedTimeSettings[key] + 1),
                        })}
                        style={({ pressed }) => [styles.timeBasedStepperButton, pressed && styles.pressed]}
                      >
                        <Ionicons name="add" size={16} color={COLORS.purpleDark} />
                      </Pressable>
                    </View>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onTimeBasedLearningSettingsChange(DEFAULT_TIME_BASED_LEARNING_SETTINGS)}
                  style={({ pressed }) => [styles.timeBasedResetButton, pressed && styles.pressed]}
                >
                  <Ionicons name="refresh" size={14} color={COLORS.blue} />
                  <Text style={styles.timeBasedResetText}>Use recommended times</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}
      </View>

      <DashboardSection
        title="OMEGA TESTS"
        badge={omegaTestAttempts.length ? `${omegaTestAttempts.length} taken` : 'Weekly'}
      >
        {omegaTestAttempts.length === 0 ? (
          <View style={styles.omegaStatsEmpty}>
            <AnimatedOmegaStatsIcon />
            <View style={styles.omegaStatsEmptyCopy}>
              <Text style={styles.omegaStatsEmptyTitle}>Your full-word assessment lives here</Text>
              <Text style={styles.omegaStatsEmptyText}>
                Complete an Omega Test from Quiz to track every weekly result, accuracy, and time.
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.omegaStatsSummaryRow}>
              <AnimatedOmegaStatsIcon compact />
              <View style={styles.omegaStatsMetric}>
                <Text style={styles.omegaStatsMetricValue}>{omegaTestBest}%</Text>
                <Text style={styles.omegaStatsMetricLabel}>Best score</Text>
              </View>
              <View style={styles.omegaStatsMetricDivider} />
              <View style={styles.omegaStatsMetric}>
                <Text style={styles.omegaStatsMetricValue}>{omegaTestAverage}%</Text>
                <Text style={styles.omegaStatsMetricLabel}>Average</Text>
              </View>
              <View style={styles.omegaStatsMetricDivider} />
              <View style={styles.omegaStatsMetric}>
                <Text style={styles.omegaStatsMetricValue}>{omegaTestAttempts.length}</Text>
                <Text style={styles.omegaStatsMetricLabel}>Taken</Text>
              </View>
            </View>
            <View style={styles.omegaStatsHistory}>
              {omegaTestAttempts.map((attempt) => {
                const percent = attempt.total
                  ? Math.round((attempt.score / attempt.total) * 100)
                  : 0;
                const dateLabel = new Date(`${attempt.date}T12:00:00`).toLocaleDateString(
                  'en-US',
                  { month: 'short', day: 'numeric', year: 'numeric' },
                );
                return (
                  <View key={attempt.id} style={styles.omegaStatsHistoryRow}>
                    <View style={styles.omegaStatsHistoryIcon}>
                      <Ionicons name="shield-checkmark" size={15} color={COLORS.purpleDark} />
                    </View>
                    <View style={styles.omegaStatsHistoryCopy}>
                      <Text style={styles.omegaStatsHistoryTitle}>Omega Test · {dateLabel}</Text>
                      <Text style={styles.omegaStatsHistoryText}>
                        {attempt.score}/{attempt.total} correct · {formatStudyTime(attempt.durationSeconds)}
                      </Text>
                    </View>
                    <Text style={styles.omegaStatsHistoryScore}>{percent}%</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </DashboardSection>

      <DashboardSection title="QUIZ TREND" badge="Recent">
        {recentQuizzes.length === 0 ? (
          <Text style={styles.dashboardEmptyText}>
            Complete a daily quiz and your progress will appear here.
          </Text>
        ) : (
          <>
            {quizTrendExpanded ? (
              <Text style={styles.expandedListHint}>
                Double-tap any quiz to show recent quizzes
              </Text>
            ) : null}
            {quizTrendAttempts.map((attempt) => {
            const percent = attempt.total
              ? Math.round((attempt.score / attempt.total) * 100)
              : 0;
            const dateLabel = new Date(`${attempt.date}T12:00:00`).toLocaleDateString(
              'en-US',
              { month: 'short', day: 'numeric' },
            );
            const quizKind = getQuizAttemptKind(attempt, analytics.quizHistory);
            const isPracticeQuiz = quizKind === 'practice';
            const trendLabel = isPracticeQuiz ? 'Practice quiz' : 'Daily quiz';
            const status =
              percent >= 80 ? 'Strong' : percent >= 50 ? 'Building' : 'Needs review';
            const tone = getQuizTrendTone(percent);
            return (
              <Pressable
                key={attempt.id}
                accessibilityRole={quizTrendExpanded ? 'button' : undefined}
                accessibilityHint={
                  quizTrendExpanded
                    ? 'Double-tap twice quickly to show recent quizzes'
                    : undefined
                }
                disabled={!quizTrendExpanded}
                onPress={collapseQuizTrendOnDoubleTap}
                style={[
                  styles.trendRow,
                  {
                    backgroundColor: tone.surface,
                    borderColor: tone.border,
                  },
                ]}
              >
                <View style={styles.trendRowHeader}>
                  <View style={styles.trendLabelCopy}>
                    <View style={styles.trendTitleRow}>
                      <Ionicons
                        name={isPracticeQuiz ? 'sparkles' : 'checkmark-circle'}
                        size={14}
                        color={isPracticeQuiz ? COLORS.purple : COLORS.greenDark}
                      />
                      <Text style={styles.trendTitle}>{trendLabel}</Text>
                    </View>
                    <Text style={styles.trendDate}>{dateLabel}</Text>
                  </View>
                  <Text
                    style={[
                      styles.trendScore,
                      {
                        color: tone.scoreText,
                        backgroundColor: tone.scoreBackground,
                      },
                    ]}
                  >
                    {attempt.score}/{attempt.total} correct
                  </Text>
                </View>
                <View
                  style={[
                    styles.trendTrack,
                    { backgroundColor: tone.track },
                  ]}
                >
                  <ProgressFill
                    color={tone.fill}
                    progress={percent}
                    radius={5}
                    style={{ width: `${percent}%` }}
                  />
                </View>
                <View style={styles.trendFooter}>
                  <Text
                    style={[
                      styles.trendStatus,
                      { color: tone.status },
                    ]}
                  >
                    {status}
                  </Text>
                  <Text style={[styles.trendPercent, { color: tone.percent }]}>
                    {percent}%
                  </Text>
                </View>
              </Pressable>
            );
            })}
            {quizTrendExpanded && quizTrendPageCount > 1 ? (
              <CompactPagination
                page={currentQuizTrendPage}
                pageCount={quizTrendPageCount}
                pageSize={QUIZ_TREND_PAGE_SIZE}
                total={analytics.quizHistory.length}
                itemLabel="quiz history"
                onPrevious={() =>
                  setQuizTrendPage(Math.max(0, currentQuizTrendPage - 1))
                }
                onNext={() =>
                  setQuizTrendPage(
                    Math.min(quizTrendPageCount - 1, currentQuizTrendPage + 1),
                  )
                }
              />
            ) : null}
            {analytics.quizHistory.length > recentQuizzes.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  quizTrendExpanded
                    ? 'Show recent quiz history'
                    : 'View all quiz history'
                }
                onPress={() => {
                  if (quizTrendExpanded) {
                    setQuizTrendExpanded(false);
                    return;
                  }

                  setQuizTrendPage(0);
                  setQuizTrendExpanded(true);
                }}
                style={({ pressed }) => [
                  styles.trendHistoryToggle,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.trendHistoryToggleText}>
                  {quizTrendExpanded
                    ? 'Show recent quizzes'
                    : `View all ${analytics.quizHistory.length} quizzes`}
                </Text>
                <Ionicons
                  name={quizTrendExpanded ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.purpleDark}
                />
              </Pressable>
            ) : null}
          </>
        )}
      </DashboardSection>



      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open the WordWiz guide"
        onPress={onOpenOnboardingGuide}
        style={({ pressed }) => [styles.wordWizGuideCard, pressed && styles.pressed]}
      >
        <View style={styles.wordWizGuideIcon}>
          <Ionicons name="compass-outline" size={21} color={COLORS.purpleDark} />
        </View>
        <View style={styles.wordWizGuideCopy}>
          <Text style={styles.wordWizGuideLabel}>NEED A REFRESHER?</Text>
          <Text style={styles.wordWizGuideTitle}>How WordWiz works</Text>
          <Text style={styles.wordWizGuideText}>
            Revisit the quick guide to saving, reviewing, and growing your words.
          </Text>
        </View>
        <View style={styles.wordWizGuideArrow}>
          <Ionicons name="arrow-forward" size={16} color={COLORS.purpleDark} />
        </View>
      </Pressable>

      <View style={styles.subscriptionOverviewCard}>
        <View style={styles.subscriptionOverviewHeader}>
          <View style={styles.subscriptionOverviewIcon}>
            <Ionicons
              name={isSubscribed || isComplimentary ? 'sparkles' : 'card-outline'}
              size={21}
              color={isSubscribed || isComplimentary ? COLORS.purpleDark : COLORS.blue}
            />
          </View>
          <View style={styles.subscriptionOverviewHeaderCopy}>
            <Text style={styles.subscriptionOverviewLabel}>SUBSCRIPTION</Text>
            <Text style={styles.subscriptionOverviewTitle}>Your WordWiz access</Text>
          </View>
          <View
            style={[
              styles.subscriptionStatusPill,
              subscriptionStatus === 'ACTIVE' && styles.subscriptionStatusPillActive,
              isComplimentary && styles.subscriptionStatusPillTrial,
            ]}
          >
            <Text
              style={[
                styles.subscriptionStatusPillText,
                subscriptionStatus === 'ACTIVE' && styles.subscriptionStatusPillTextActive,
                isComplimentary && styles.subscriptionStatusPillTextTrial,
              ]}
            >
              {subscriptionStatus}
            </Text>
          </View>
        </View>
        <View style={styles.subscriptionOverviewDetails}>
          <View style={styles.subscriptionOverviewDetail}>
            <Text style={styles.subscriptionOverviewDetailLabel}>CURRENT PLAN</Text>
            <Text style={styles.subscriptionOverviewDetailValue}>{subscription.currentPlan}</Text>
          </View>
          <View style={styles.subscriptionOverviewDivider} />
          <View style={styles.subscriptionOverviewDetail}>
            <Text style={styles.subscriptionOverviewDetailLabel}>{subscriptionDateLabel}</Text>
            <Text style={styles.subscriptionOverviewDetailValue}>{subscriptionDateValue}</Text>
          </View>
        </View>
        {subscription.statusMessage ? (
          <Text style={styles.subscriptionOverviewNote}>{subscription.statusMessage}</Text>
        ) : null}
        {isComplimentary ? (
          <Text style={styles.subscriptionOverviewNote}>
            {subscription.complimentaryDaysRemaining} {subscription.complimentaryDaysRemaining === 1 ? 'day' : 'days'} of full Plus access remain. No subscription is active yet.
          </Text>
        ) : subscription.accessSource === 'free' && subscription.monthlyWordsRemaining !== null ? (
          <Text style={styles.subscriptionOverviewNote}>
            {subscription.monthlyWordsRemaining} {subscription.monthlyWordsRemaining === 1 ? 'word' : 'words'} remaining this month. Flashcards for saved words stay available.
          </Text>
        ) : null}
        <View style={styles.subscriptionOverviewActions}>
          {isSubscribed ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void manageSubscription()}
              style={({ pressed }) => [styles.subscriptionManageAction, pressed && styles.pressed]}
            >
              <Ionicons name="settings-outline" size={16} color={COLORS.purpleDark} />
              <Text style={styles.subscriptionManageActionText}>MANAGE SUBSCRIPTION</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenPlus}
              style={({ pressed }) => [styles.subscriptionManageAction, pressed && styles.pressed]}
            >
              <Ionicons name="sparkles-outline" size={16} color={COLORS.purpleDark} />
              <Text style={styles.subscriptionManageActionText}>
                {isComplimentary ? 'VIEW PLANS' : 'UPGRADE TO PLUS'}
              </Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={subscription.isRestoring}
            onPress={() => void restoreSubscription()}
            style={({ pressed }) => [
              styles.subscriptionRestoreAction,
              subscription.isRestoring && styles.practiceButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            {subscription.isRestoring ? (
              <ActivityIndicator size="small" color={COLORS.blue} />
            ) : (
              <Ionicons name="refresh-outline" size={16} color={COLORS.blue} />
            )}
            <Text style={styles.subscriptionRestoreActionText}>RESTORE PURCHASES</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.accountCard}>
        <View style={styles.accountAvatar}>
          <Text style={styles.accountAvatarText}>
            {(currentUser?.name || 'W').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.accountCopy}>
          <Text style={styles.accountLabel}>ACCOUNT</Text>
          <Text style={styles.accountName}>
            {currentUser?.name || 'WordWiz learner'}
          </Text>
          <Text
            style={styles.accountEmail}
            numberOfLines={1}
            ellipsizeMode="middle"
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {currentUser?.email || 'Local prototype account'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out of WordWiz"
          onPress={onLogout}
          style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
        >
          <Ionicons name="log-out-outline" size={18} color={COLORS.red} />
          <Text style={styles.logoutButtonText}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.deleteAccountCard}>
        <View style={styles.deleteAccountIcon}>
          <Ionicons name="trash-outline" size={22} color={COLORS.red} />
        </View>
        <View style={styles.deleteAccountCopy}>
          <Text style={styles.deleteAccountLabel}>ACCOUNT CONTROL</Text>
          <Text style={styles.deleteAccountTitle}>Delete account</Text>
          <Text style={styles.deleteAccountText}>
            Permanently remove your WordWiz account and cloud learning data.
            This action cannot be undone.
          </Text>
        </View>
        <Pressable
          onPress={onDeleteAccount}
          style={({ pressed }) => [
            styles.deleteAccountButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.deleteAccountButtonText}>Delete</Text>
        </Pressable>
      </View>

      <View style={styles.legalCard}>
        <View style={styles.legalHeaderIcon}>
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.blue} />
        </View>
        <View style={styles.legalCardCopy}>
          <Text style={styles.legalCardTitle}>About & legal</Text>
          <Text style={styles.legalCardText}>
            Read how WordWiz works and how your learning data is handled.
          </Text>
        </View>
        <View style={styles.legalLinkStack}>
          <LegalLink label="Terms" onPress={() => onOpenLegal('terms')} />
          <LegalLink label="Privacy" onPress={() => onOpenLegal('privacy')} />
        </View>
      </View>

      <Text style={styles.estimateNote}>
        Mastery is an estimate based on flashcard answers, quiz results, and
        repeated reviews. It is not a scientific assessment.
      </Text>
    </ScrollView>
  );
}

function StreakHistoryStat({
  current,
  recent,
}: {
  current: number;
  recent: number[];
}) {
  return (
    <View style={styles.streakHistoryStat}>
      <View style={styles.streakHistoryStatTopRow}>
        <View style={styles.streakHistoryStatIcon}>
          <Ionicons name="flame" size={20} color={COLORS.teal} />
        </View>
        <Text style={styles.streakHistoryStatCurrent}>{current}d</Text>
      </View>
      <Text style={styles.streakHistoryStatLabel}>CURRENT STREAK</Text>
      {recent.length > 0 ? (
        <View style={styles.streakHistoryStatRecentRow}>
          <Text style={styles.streakHistoryStatRecentLabel}>RECENT</Text>
          {recent.map((length, index) => (
            <View key={`${length}-${index}`} style={styles.streakHistoryStatChip}>
              <Text style={styles.streakHistoryStatChipText}>{length}d</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.streakHistoryStatEmpty}>Your streak story starts here</Text>
      )}
    </View>
  );
}

function FeedbackDistribution({
  summary,
  compact = false,
}: {
  summary: QuizFeedbackSummary;
  compact?: boolean;
}) {
  const items = [
    { id: 'hard', label: 'Hard', value: summary.hard, color: COLORS.orange },
    { id: 'correct', label: 'Got it', value: summary.correct, color: COLORS.blue },
    { id: 'easy', label: 'Easy', value: summary.easy, color: COLORS.greenDark },
  ];

  return (
    <>
      <View style={styles.feedbackDistributionBar}>
        {items.map((item) =>
          item.value > 0 ? (
            <View
              key={item.id}
              style={[
                styles.feedbackDistributionSegment,
                { flex: item.value, backgroundColor: item.color },
              ]}
            />
          ) : null,
        )}
      </View>
      <View
        style={[
          styles.feedbackDistributionLegend,
          compact && styles.feedbackDistributionLegendCompact,
        ]}
      >
        {items.map((item) => {
          const percent = summary.total
            ? Math.round((item.value / summary.total) * 100)
            : 0;
          return (
            <View key={item.id} style={styles.feedbackLegendItem}>
              <View
                style={[styles.feedbackLegendDot, { backgroundColor: item.color }]}
              />
              <Text style={styles.feedbackLegendText}>
                {item.label} {compact ? item.value : `${item.value} · ${percent}%`}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

function RecallPaceList({
  items,
  view,
}: {
  items: Array<{
    key: string;
    answerCount: number;
    averageSeconds: number;
    term?: string;
  }>;
  view: 'types' | 'words';
}) {
  const slowestAverage = Math.max(...items.map((item) => item.averageSeconds), 1);

  return (
    <View style={styles.recallPaceList}>
      {items.map((item) => {
        const label = view === 'types'
          ? formatQuestionType(item.key)
          : item.term ?? 'Saved word';
        const width = Math.max(10, Math.round((item.averageSeconds / slowestAverage) * 100));
        return (
          <View key={item.key} style={styles.recallPaceRow}>
            <View style={styles.recallPaceHeader}>
              <Text numberOfLines={1} style={styles.recallPaceName}>{label}</Text>
              <View style={styles.recallPaceValuePill}>
                <Ionicons name="time-outline" size={12} color={COLORS.blue} />
                <Text style={styles.recallPaceValue}>{formatPace(item.averageSeconds)}</Text>
              </View>
            </View>
            <View style={styles.recallPaceTrack}>
              <ProgressFill
                color={COLORS.blue}
                progress={width}
                radius={4}
                style={{ width: `${width}%` }}
              />
            </View>
            <Text style={styles.recallPaceMeta}>
              {item.answerCount} {item.answerCount === 1 ? 'response' : 'responses'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RecallSignalDistribution({
  summary,
  settings,
}: {
  summary: {
    fluent: number;
    successful: number;
    reinforcement: number;
    incorrect: number;
    total: number;
  };
  settings: TimeBasedLearningSettings;
}) {
  const signals = [
    { id: 'fluent', label: 'Fluent', value: summary.fluent, color: COLORS.greenDark },
    { id: 'successful', label: 'Recalled', value: summary.successful, color: COLORS.blue },
    { id: 'reinforcement', label: 'Reinforce', value: summary.reinforcement, color: COLORS.orange },
    { id: 'incorrect', label: 'Missed', value: summary.incorrect, color: COLORS.red },
  ];

  return (
    <View style={styles.recallSignalCard}>
      <View style={styles.recallSignalBar}>
        {signals.map((signal) =>
          signal.value ? (
            <View
              key={signal.id}
              style={[styles.recallSignalSegment, { flex: signal.value, backgroundColor: signal.color }]}
            />
          ) : null,
        )}
      </View>
      <View style={styles.recallSignalLegend}>
        {signals.map((signal) => (
          <Text key={signal.id} style={[styles.recallSignalLegendText, { color: signal.color }]}>
            {signal.label} {signal.value}
          </Text>
        ))}
      </View>
      <Text style={styles.recallSignalNote}>
        Fluent under {FLUENT_RECALL_SECONDS}s · recommended windows: {settings.multipleChoiceSeconds}s multiple choice, {settings.fillInSeconds}s fill, {settings.typedRecallSeconds}s type.
      </Text>
    </View>
  );
}

function RetrievalEvidenceCard({
  label,
  value,
  detail,
  color,
  pale,
}: {
  label: string;
  value: number;
  detail: string;
  color: string;
  pale: string;
}) {
  return (
    <View style={[styles.retrievalEvidenceCard, { backgroundColor: pale }]}>
      <Text style={[styles.retrievalEvidenceValue, { color }]}>{value}%</Text>
      <Text style={styles.retrievalEvidenceLabel}>{label}</Text>
      <Text style={styles.retrievalEvidenceDetail}>{detail}</Text>
    </View>
  );
}

function formatPace(seconds: number) {
  return `${seconds % 1 === 0 ? seconds : seconds.toFixed(1)}s avg`;
}

function formatQuestionType(mode: string) {
  const labels: Record<string, string> = {
    'word-to-definition': 'Meaning match',
    'definition-to-word': 'Word match',
    'true-false': 'True or false',
    'typed-word': 'Type the word',
    'sentence-usage': 'Sentence context',
    'sentence-completion': 'Complete the context',
    'closest-synonym': 'Closest synonym',
  };
  return labels[mode] ?? 'Quiz question';
}

function PracticeEstimateDetail({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.insightDetailRow}>
      <View style={styles.insightDetailIcon}>
        <Ionicons name={icon} size={15} color={COLORS.purpleDark} />
      </View>
      <View style={styles.insightDetailCopy}>
        <Text style={styles.insightDetailTitle}>{title}</Text>
        <Text style={styles.insightDetailText}>{text}</Text>
      </View>
    </View>
  );
}

function ReminderTimeStepper({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View style={styles.reminderTimeUnit}>
      <Text style={styles.reminderTimeUnitLabel}>{label}</Text>
      <View style={styles.reminderStepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease reminder ${label.toLowerCase()}`}
          onPress={onDecrease}
          style={({ pressed }) => [
            styles.reminderStepperButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="remove" size={18} color={COLORS.blue} />
        </Pressable>
        {label === 'Hour' ? (
          <View style={styles.reminderHourValue}>
            {value.split(' ').map((part) => (
              <Text key={part} style={styles.reminderStepperValue}>
                {part}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.reminderStepperValue}>{value}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase reminder ${label.toLowerCase()}`}
          onPress={onIncrease}
          style={({ pressed }) => [
            styles.reminderStepperButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="add" size={18} color={COLORS.blue} />
        </Pressable>
      </View>
    </View>
  );
}

function AnimatedOmegaStatsIcon({ compact = false }: { compact?: boolean }) {
  const orbit = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.loop(
        Animated.timing(orbit, {
          toValue: 1,
          duration: 6000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1.07,
            duration: 1050,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1050,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    ]);
    animation.start();
    return () => animation.stop();
  }, [orbit, pulse]);

  const rotate = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={[styles.omegaStatsOrb, compact && styles.omegaStatsOrbCompact]}
    >
      <View style={styles.omegaStatsOrbHalo} />
      <Animated.View
        style={[styles.omegaStatsOrbOrbit, { transform: [{ rotate }] }]}
      >
        <Ionicons name="ellipse-outline" size={45} color="#C7B3FF" />
        <View style={styles.omegaStatsOrbSatellite}>
          <Ionicons name="sparkles" size={10} color="#FFD36B" />
        </View>
      </Animated.View>
      <Animated.View
        style={[styles.omegaStatsOrbCore, { transform: [{ scale: pulse }] }]}
      >
        <Ionicons name="shield-checkmark" size={compact ? 15 : 18} color={COLORS.white} />
      </Animated.View>
    </View>
  );
}

function createGoldSparklePath(centerX: number, centerY: number, radius: number) {
  const innerRadius = radius * 0.32;
  const path = Skia.Path.Make();

  path.moveTo(centerX, centerY - radius);
  path.lineTo(centerX + innerRadius, centerY - innerRadius);
  path.lineTo(centerX + radius, centerY);
  path.lineTo(centerX + innerRadius, centerY + innerRadius);
  path.lineTo(centerX, centerY + radius);
  path.lineTo(centerX - innerRadius, centerY + innerRadius);
  path.lineTo(centerX - radius, centerY);
  path.lineTo(centerX - innerRadius, centerY - innerRadius);
  path.close();

  return path;
}

function WordLevelDistributionBar({
  proficientWords,
  strongWords,
  buildingWords,
  learningWords,
}: {
  proficientWords: number;
  strongWords: number;
  buildingWords: number;
  learningWords: number;
}) {
  const [barWidth, setBarWidth] = useState(0);
  const total = proficientWords + strongWords + buildingWords + learningWords;
  const proficientFraction = total > 0 ? proficientWords / total : 0;
  const hasProficientWords = proficientWords > 0 && barWidth > 0;
  const sparkleX = Math.max(7, Math.min(barWidth - 7, barWidth * proficientFraction));
  const mainSparkle = useMemo(
    () => createGoldSparklePath(sparkleX, 6, 4.2),
    [sparkleX],
  );
  const smallSparkle = useMemo(
    () => createGoldSparklePath(Math.min(barWidth - 3, sparkleX + 5.2), 2.5, 1.5),
    [barWidth, sparkleX],
  );
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setBarWidth((current) => (current === nextWidth ? current : nextWidth));
  }, []);

  return (
    <View onLayout={onLayout} style={styles.distributionBar}>
      {total > 0 ? (
        <>
          {proficientWords > 0 ? (
            <View
              style={[
                styles.distributionSegment,
                styles.distributionMasteredSegment,
                {
                  flex: proficientWords,
                  backgroundColor: getWordMasteryCategory(100).color,
                },
              ]}
            />
          ) : null}
          <View style={{ flex: strongWords, backgroundColor: getWordMasteryCategory(80).color }} />
          <View style={{ flex: buildingWords, backgroundColor: getWordMasteryCategory(40).color }} />
          <View style={{ flex: learningWords, backgroundColor: getWordMasteryCategory(0).color }} />
        </>
      ) : null}
      {hasProficientWords ? (
        <SkiaCanvas pointerEvents="none" style={styles.distributionSparkleCanvas}>
          <SkiaCircle cx={sparkleX} cy={6} color="#9B7424" opacity={0.6} r={5.5} />
          <SkiaPath color="#FFD66E" path={mainSparkle} />
          <SkiaPath color="#FFF4C5" path={smallSparkle} />
          <SkiaCircle cx={Math.max(2, sparkleX - 5.8)} cy={8.6} color="#FFE9A4" r={1.05} />
        </SkiaCanvas>
      ) : null}
    </View>
  );
}

function QuizAccuracyRing({
  accuracy,
  state,
}: {
  accuracy: number;
  state: 'empty' | 'zero' | 'scored';
}) {
  const safeProgress = Math.max(0, Math.min(100, accuracy)) / 100;
  const ringPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(
      QUIZ_ACCURACY_RING_SIZE / 2,
      QUIZ_ACCURACY_RING_SIZE / 2,
      QUIZ_ACCURACY_RING_RADIUS,
    );
    return path;
  }, []);
  const glowOpacity = safeProgress >= 75 ? 0.2 : safeProgress >= 50 ? 0.11 : 0;
  const trackColor = state === 'empty'
    ? '#DED8F3'
    : state === 'zero'
      ? '#F4B9CF'
      : '#F06E99';
  const endpointAngle = -Math.PI / 2 + safeProgress * Math.PI * 2;
  const endpointX = QUIZ_ACCURACY_RING_SIZE / 2 + Math.cos(endpointAngle) * QUIZ_ACCURACY_RING_RADIUS;
  const endpointY = QUIZ_ACCURACY_RING_SIZE / 2 + Math.sin(endpointAngle) * QUIZ_ACCURACY_RING_RADIUS;

  return (
    <SkiaCanvas pointerEvents="none" style={styles.accuracyGaugeRing}>
      <SkiaGroup
        origin={vec(QUIZ_ACCURACY_RING_SIZE / 2, QUIZ_ACCURACY_RING_SIZE / 2)}
        transform={[{ rotate: -Math.PI / 2 }]}
      >
        <SkiaPath
          path={ringPath}
          color={trackColor}
          end={1}
          start={0}
          style="stroke"
          strokeCap="butt"
          strokeWidth={QUIZ_ACCURACY_RING_STROKE}
        />
        {glowOpacity > 0 ? (
          <SkiaPath
            path={ringPath}
            color="#28C99A"
            end={safeProgress}
            opacity={glowOpacity}
            start={0}
            style="stroke"
            strokeCap="butt"
            strokeWidth={QUIZ_ACCURACY_RING_STROKE + 3}
          />
        ) : null}
        {safeProgress > 0 ? (
          <SkiaPath
            path={ringPath}
            color="#28C99A"
            end={safeProgress}
            start={0}
            style="stroke"
            strokeCap="butt"
            strokeWidth={QUIZ_ACCURACY_RING_STROKE}
          />
        ) : null}
      </SkiaGroup>
      {safeProgress >= 100 ? (
        <SkiaCircle cx={endpointX} cy={endpointY} color="#FFE9A7" r={4.4} />
      ) : null}
    </SkiaCanvas>
  );
}

function DailyActivityBar({
  day,
  isToday,
  compact = false,
}: {
  day: {
    key: string;
    label: string;
    activityCount: number;
    quizCount: number;
    testCount: number;
    studySeconds: number;
    dailyProgress: number;
  };
  isToday: boolean;
  compact?: boolean;
}) {
  const isActive = day.activityCount > 0 || day.studySeconds > 0;
  const quizShare = day.quizCount
    ? Math.max(
        22,
        Math.min(
          58,
          (day.quizCount / Math.max(1, day.activityCount)) * 100,
        ),
      )
    : 0;
  const testShare = day.testCount
    ? Math.max(
        22,
        Math.min(
          58,
          (day.testCount / Math.max(1, day.activityCount)) * 100,
        ),
      )
    : 0;
  const fillColor = isToday ? COLORS.green : COLORS.blue;
  const fillPercent = Math.max(isActive ? 12 : 18, day.dailyProgress);
  const quizPercent = fillPercent * (quizShare / 100);
  const testPercent = fillPercent * (testShare / 100);

  return (
    <View style={[styles.barColumn, compact && styles.barColumnCompact]}>
      <Text style={styles.barValue}>
        {isActive ? formatStudyTime(day.studySeconds) : ''}
      </Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { height: `${fillPercent}%`, backgroundColor: fillColor },
          ]}
        />
        {quizShare ? (
          <View
            pointerEvents="none"
            style={[
              styles.barQuizSegment,
              styles.barActivitySegmentOverlay,
              testPercent === 0 && styles.barQuizSegmentRounded,
              { height: `${quizPercent}%`, bottom: `${testPercent}%` },
            ]}
          />
        ) : null}
        {testShare ? (
          <View
            pointerEvents="none"
            style={[
              styles.barTestSegment,
              styles.barActivitySegmentOverlay,
              { height: `${testPercent}%` },
            ]}
          />
        ) : null}
      </View>
      <Text style={[styles.barLabel, isToday && styles.barLabelToday]}>
        {compact ? new Date(`${day.key}T12:00:00`).getDate() : day.label}
      </Text>
      <Text style={styles.practiceBarQuizText}>
        {isActive
          ? day.testCount > 0
            ? `${day.testCount}t`
            : day.quizCount > 0
              ? `${day.quizCount}q`
              : ''
          : ''}
      </Text>
    </View>
  );
}

function getDailyActivityProgress(studySeconds: number, quizCount: number) {
  const studyProgress = Math.min(
    70,
    (Math.max(0, studySeconds) / DAILY_ACTIVITY_TARGET_STUDY_SECONDS) * 70,
  );
  const quizProgress = Math.min(30, Math.max(0, quizCount) * 15);

  return Math.round(studyProgress + quizProgress);
}

function normalizeReminderTime(hour: number, minute: number) {
  const minutesInDay = 24 * 60;
  const totalMinutes =
    ((hour * 60 + minute) % minutesInDay + minutesInDay) % minutesInDay;

  return {
    hour: Math.floor(totalMinutes / 60),
    minute: totalMinutes % 60,
  };
}

function buildMasteryRingSegments(score: number) {
  return MASTERY_LEVELS.map((level, index) => {
    const nextLevel = MASTERY_LEVELS[index + 1];
    const startScore = level.minScore;
    const endScore = nextLevel?.minScore ?? 100;
    const scoreSpan = endScore - startScore;
    const midScore = startScore + scoreSpan / 2;
    const segmentProgress =
      score >= endScore
        ? 1
        : score <= startScore
          ? 0
          : (score - startScore) / scoreSpan;

    return {
      shortTitle: level.shortTitle,
      color: level.color,
      angle: (midScore / 100) * 360,
      fillPercent: Math.round(segmentProgress * 100),
      isCurrent: score >= startScore && score < endScore,
    };
  });
}

function getQuizTrendTone(percent: number) {
  if (percent >= 100) {
    return {
      fill: '#F4B400',
      status: '#D89F00',
      percent: COLORS.muted,
      scoreText: COLORS.blue,
      scoreBackground: COLORS.bluePale,
      surface: '#FFFCFF',
      border: '#E8DEFA',
      track: '#F8E29A',
    };
  }

  if (percent >= 80) {
    return {
      fill: COLORS.teal,
      status: COLORS.teal,
      percent: COLORS.muted,
      scoreText: COLORS.blue,
      scoreBackground: COLORS.bluePale,
      surface: '#FFFCFF',
      border: '#E8DEFA',
      track: '#EFEAF8',
    };
  }

  if (percent >= 40) {
    return {
      fill: COLORS.purple,
      status: COLORS.purple,
      percent: COLORS.muted,
      scoreText: COLORS.blue,
      scoreBackground: COLORS.bluePale,
      surface: '#FFFCFF',
      border: '#E8DEFA',
      track: '#EFEAF8',
    };
  }

  return {
    fill: COLORS.blue,
    status: COLORS.blue,
    percent: COLORS.muted,
    scoreText: COLORS.blue,
    scoreBackground: COLORS.bluePale,
    surface: '#FFFCFF',
    border: '#E8DEFA',
    track: '#EFEAF8',
  };
}

function formatReminderHour(hour: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour} ${period}`;
}

function formatReminderMinute(minute: number) {
  return minute.toString().padStart(2, '0');
}

function formatLastReviewed(value: string | undefined) {
  if (!value) return 'New word';
  const reviewedAt = new Date(value);
  if (Number.isNaN(reviewedAt.getTime())) return 'New word';

  return `Reviewed ${reviewedAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
}

function formatSubscriptionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}
