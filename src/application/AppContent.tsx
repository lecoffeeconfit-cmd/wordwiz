import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabs } from '../components';
import {
  DEFAULT_REMINDER,
  EMPTY_ANALYTICS,
  STARTER_WORDS,
} from '../constants/data';
import {
  type WordWizStarterCollection,
} from '../constants/wordCollections';
import { COLORS } from '../constants/theme';
import {
  AddWordModal,
  ComplimentaryAccessModal,
  DeleteWordModal,
  WordWizPlusModal,
} from '../modals';
import {
  CardsScreen,
  DashboardScreen,
  HomeScreen,
  type PausedQuizSession,
  LoginScreen,
  QuizScreen,
  WordsScreen,
} from '../screens';
import {
  normalizeEmail,
  completeSupabaseAuthRedirect,
  resendSupabaseEmailVerification,
  requestSupabaseAccountDeletion,
  sendSupabasePasswordReset,
  signInWithOAuthProvider,
  signInWithSupabase,
  signOutWithSupabase,
  signUpWithSupabase,
  supabase,
  toAuthUser,
  validateEmail,
  validateName,
  validatePassword,
  cancelReminder,
  buildSmartReminderMessages,
  deleteCloudWord,
  createCloudWordWithFreeLimit,
  DuplicateWordError,
  FreeWordLimitError,
  lookupWordDetails,
  syncRevenueCatEntitlement,
  fetchUserLearningData,
  reportError,
  saveCloudCardReview,
  saveCloudQuizAttempt,
  saveCloudReminderSettings,
  saveCloudWord,
  saveCloudWords,
  saveCloudStudySetMembership,
  scheduleDailyReminder,
  setSentryUser,
  trackEvent,
} from '../services';
import { env } from '../config/env';
import { useSubscription } from '../subscription/SubscriptionProvider';
import { styles } from '../styles';
import type {
  AnalyticsData,
  AchievementWallet,
  AuthUser,
  LegalPage,
  QuizAnswer,
  QuizAttempt,
  QuizProgress,
  QuizPreferences,
  ReminderSettings,
  SortMode,
  Tab,
  TimeBasedLearningSettings,
  Word,
  WordDetails,
  StudySetMembership,
} from '../types';
import type { Provider } from '@supabase/supabase-js';
import {
  addQuizAttempt,
  applyFlashcardReview,
  applyQuizMastery,
  buildAchievements,
  buildQuizCompletion,
  buildWordFromInput,
  calculateStreakStats,
  DEFAULT_TIME_BASED_LEARNING_SETTINGS,
  getDayKey,
  getDueReviewWords,
  getNextMasteryLevel,
  getSavedWordTermKey,
  getWordMastery,
  getWordMasteryProgress,
  mergeWordLists,
  normalizeQuestionTypePreferences,
  upsertSavedWord,
} from '../utils';

const CLOUD_HYDRATE_CACHE_MS = 30 * 60 * 1000;
const LEGACY_ONBOARDING_KEY = '@wordwiz/onboarding-complete/v1';
const LEGAL_PAGE_URLS: Record<LegalPage, string> = {
  privacy: 'https://lecoffeeconfit-cmd.github.io/wordwiz-legal/',
  terms: 'https://lecoffeeconfit-cmd.github.io/wordwiz-legal/terms.html',
};
const CLOUD_SYNC_LOGS_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_WORDWIZ_EGRESS_LOGS === 'true';
const DEFAULT_QUIZ_PREFERENCES: QuizPreferences = {
  enabled: true,
  difficulty: 'automatic',
  questionTypes: normalizeQuestionTypePreferences(undefined),
};
const EMPTY_ACHIEVEMENT_WALLET: AchievementWallet = {
  claimedAchievementIds: [],
  points: 0,
  refreshTokens: 0,
};

export default function AppContent() {
  const subscription = useSubscription();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [words, setWords] = useState<Word[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical');
  const [initialCardWordId, setInitialCardWordId] = useState<string | null>(null);
  const [initialCardStudyGroup, setInitialCardStudyGroup] = useState<
    'flagged' | undefined
  >();
  const [initialQuizStudyGroup, setInitialQuizStudyGroup] = useState<
    'flagged' | undefined
  >();
  const [openStudySetBuilderOnMount, setOpenStudySetBuilderOnMount] =
    useState(false);
  const [quizPriorityWordIds, setQuizPriorityWordIds] = useState<string[]>([]);
  const [quizProgress, setQuizProgress] = useState<QuizProgress | null>(null);
  const [pausedQuizSession, setPausedQuizSession] =
    useState<PausedQuizSession | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>(EMPTY_ANALYTICS);
  const [achievementWallet, setAchievementWallet] =
    useState<AchievementWallet>(EMPTY_ACHIEVEMENT_WALLET);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings>(DEFAULT_REMINDER);
  const [dailyQuizGoal, setDailyQuizGoal] = useState(1);
  const [timedLearningEnabled, setTimedLearningEnabled] = useState(false);
  const [timeBasedLearningSettings, setTimeBasedLearningSettings] =
    useState<TimeBasedLearningSettings>(DEFAULT_TIME_BASED_LEARNING_SETTINGS);
  const [quizPreferences, setQuizPreferences] =
    useState<QuizPreferences>(DEFAULT_QUIZ_PREFERENCES);
  const [isReady, setIsReady] = useState(false);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [currentDayKey, setCurrentDayKey] = useState(getDayKey());
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [showOnboardingGuide, setShowOnboardingGuide] = useState(false);
  const [showAddWord, setShowAddWord] = useState(false);
  const [wordToEdit, setWordToEdit] = useState<Word | null>(null);
  const [wordToRemove, setWordToRemove] = useState<Word | null>(null);
  const [showComplimentaryWelcome, setShowComplimentaryWelcome] = useState(false);
  const [showPlusPaywall, setShowPlusPaywall] = useState(false);
  const [plusPaywallReason, setPlusPaywallReason] = useState<
    'quiz' | 'word-limit' | 'premium-feature'
  >('premium-feature');
  const [justActivatedPlusUserId, setJustActivatedPlusUserId] = useState<
    string | null
  >(null);
  const cloudHydratedUserId = useRef<string | null>(null);
  const cloudHydratingUserId = useRef<string | null>(null);
  const achievementWalletLoadedUserId = useRef<string | null>(null);
  const latestWords = useRef<Word[]>([]);
  const starterCollectionEnrichmentIds = useRef(new Set<string>());
  const hasHiddenNativeSplash = useRef(false);
  const lastReminderRefreshKey = useRef<string | null>(null);
  const isSavingWord = useRef(false);
  const pendingPlusAction = useRef<(() => void) | null>(null);
  const pauseActiveQuizRef = useRef<(() => void) | null>(null);
  const immediatelyActivatedPlusUserId = useRef<string | null>(null);
  const complimentaryWelcomeUserId = useRef<string | null>(null);
  const hasFullLearningAccess =
    subscription.hasPlusAccess ||
    justActivatedPlusUserId === currentUser?.id;
  const freeWordUsage = !hasFullLearningAccess && subscription.monthlyWordsAdded !== null
    ? {
        wordsAdded: subscription.monthlyWordsAdded,
        limit: subscription.monthlyWordLimit,
      }
    : null;

  function canUseFullLearningAccess() {
    return (
      hasFullLearningAccess ||
      immediatelyActivatedPlusUserId.current === currentUser?.id
    );
  }

  useEffect(() => {
    if (
      subscription.isAccessLoading ||
      subscription.isLoading ||
      !canUseFullLearningAccess() ||
      !pendingPlusAction.current
    ) {
      return;
    }
    const action = pendingPlusAction.current;
    pendingPlusAction.current = null;
    setShowPlusPaywall(false);
    action();
  }, [hasFullLearningAccess, subscription.isAccessLoading, subscription.isLoading]);
  const smartReminderContext = useMemo(
    () => buildCurrentReminderContext(words, analytics, dailyQuizGoal),
    [analytics, currentDayKey, dailyQuizGoal, words],
  );
  const currentAchievements = useMemo(
    () => buildAchievements({ words, analytics }),
    [analytics, words],
  );
  const smartReminderMessages = useMemo(
    () => buildSmartReminderMessages(smartReminderContext),
    [smartReminderContext],
  );
  const smartReminderRefreshKey = `${reminderSettings.hour}:${reminderSettings.minute}:${JSON.stringify(smartReminderContext)}`;

  const hideNativeSplash = useCallback(() => {
    if (hasHiddenNativeSplash.current) {
      return;
    }

    hasHiddenNativeSplash.current = true;
    SplashScreen.hide();
  }, []);

  const openLegalPage = useCallback((page: LegalPage) => {
    void WebBrowser.openBrowserAsync(LEGAL_PAGE_URLS[page]).catch((error) => {
      reportError(error, { area: 'open_legal_page', page });
      Alert.alert(
        'Could not open page',
        'Please check your internet connection and try again.',
      );
    });
  }, []);

  useEffect(() => {
    latestWords.current = words;
  }, [words]);

  useEffect(() => {
    async function loadData() {
      try {
        trackEvent('app_opened');
        if (!env.isSupabaseConfigured) {
          setWords([]);
          setQuizProgress(null);
          setAnalytics(EMPTY_ANALYTICS);
          setReminderSettings(DEFAULT_REMINDER);
          setDailyQuizGoal(1);
          setTimedLearningEnabled(false);
          setTimeBasedLearningSettings(DEFAULT_TIME_BASED_LEARNING_SETTINGS);
          setQuizPreferences(DEFAULT_QUIZ_PREFERENCES);
          return;
        }

        logCloudSync('auth:get_session_start', {
          screen: 'Launch',
          reason: 'restore_session',
        });
        const sessionResult = await supabase.auth.getSession();
        logCloudSync('auth:get_session_complete', {
          screen: 'Launch',
          reason: 'restore_session',
        });
        const sessionUser = sessionResult.data.session?.user
          ? toAuthUser(sessionResult.data.session.user)
          : null;

        setCurrentUser(sessionUser);

        if (sessionUser) {
          await loadUserCache(sessionUser.id);
        } else {
          setWords([]);
          setQuizProgress(null);
          setAnalytics(EMPTY_ANALYTICS);
          setReminderSettings(DEFAULT_REMINDER);
          setDailyQuizGoal(1);
          setTimedLearningEnabled(false);
          setTimeBasedLearningSettings(DEFAULT_TIME_BASED_LEARNING_SETTINGS);
          setQuizPreferences(DEFAULT_QUIZ_PREFERENCES);
        }
      } catch (error) {
        reportError(error, { area: 'app_boot' });
        setWords([]);
        setAnalytics(EMPTY_ANALYTICS);
        setReminderSettings(DEFAULT_REMINDER);
        setDailyQuizGoal(1);
        setTimedLearningEnabled(false);
        setTimeBasedLearningSettings(DEFAULT_TIME_BASED_LEARNING_SETTINGS);
        setQuizPreferences(DEFAULT_QUIZ_PREFERENCES);
        setAppNotice('WordWiz had trouble loading saved data. Please try again when you are connected.');
      } finally {
        await clearLegacyLearningData();
        setIsReady(true);
      }
    }

    loadData();

    if (!env.isSupabaseConfigured) {
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setCurrentUser(session?.user ? toAuthUser(session.user) : null);
      },
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!env.isSupabaseConfigured) {
      return;
    }

    let isActive = true;

    async function handleAuthRedirect(url: string | null) {
      if (!url) return;

      try {
        const user = await completeSupabaseAuthRedirect(url, {
          screen: 'Auth callback',
          reason: 'email_or_provider_redirect',
        });
        if (user && isActive) {
          setCurrentUser(user);
        }
      } catch (error) {
        reportError(error, { area: 'auth_redirect' });
        if (isActive) {
          Alert.alert(
            'Could not finish verification',
            'That link may have expired. Request a new verification email and try again.',
          );
        }
      }
    }

    void Linking.getInitialURL().then(handleAuthRedirect).catch((error) => {
      reportError(error, { area: 'auth_initial_url' });
    });
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthRedirect(url);
    });

    return () => {
      isActive = false;
      linkingSubscription.remove();
    };
  }, []);

  useEffect(() => {
    setSentryUser(currentUser);
  }, [currentUser]);

  useEffect(() => {
    void subscription.syncUser(currentUser?.id ?? null);
  }, [currentUser?.id, subscription.syncUser]);

  useEffect(() => {
    if (
      !currentUser ||
      !subscription.complimentaryJustStarted ||
      complimentaryWelcomeUserId.current === currentUser.id
    ) {
      return;
    }
    complimentaryWelcomeUserId.current = currentUser.id;
    setShowComplimentaryWelcome(true);
  }, [currentUser, subscription.complimentaryExpiresAt, subscription.complimentaryJustStarted]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentDayKey(getDayKey());
    }, 30 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (
      !isReady ||
      !currentUser ||
      !reminderSettings.enabled ||
      Platform.OS === 'web' ||
      lastReminderRefreshKey.current === smartReminderRefreshKey
    ) {
      return;
    }

    const timeoutId = setTimeout(() => {
      lastReminderRefreshKey.current = smartReminderRefreshKey;
      void scheduleDailyReminder(
        reminderSettings,
        smartReminderMessages,
      )
        .then((scheduledSettings) => {
          setReminderSettings(scheduledSettings);
          saveReminderToCloud(scheduledSettings);
        })
        .catch((error) => {
          lastReminderRefreshKey.current = null;
          reportError(error, { area: 'refresh_smart_reminders' });
        });
    }, 750);

    return () => clearTimeout(timeoutId);
  }, [
    currentUser,
    isReady,
    reminderSettings.enabled,
    reminderSettings.hour,
    reminderSettings.minute,
    smartReminderMessages,
    smartReminderRefreshKey,
  ]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!currentUser) {
      setWords([]);
      setQuizProgress(null);
      setPausedQuizSession(null);
      setAnalytics(EMPTY_ANALYTICS);
      achievementWalletLoadedUserId.current = null;
      setAchievementWallet(EMPTY_ACHIEVEMENT_WALLET);
      setReminderSettings(DEFAULT_REMINDER);
      setDailyQuizGoal(1);
      setTimedLearningEnabled(false);
      setTimeBasedLearningSettings(DEFAULT_TIME_BASED_LEARNING_SETTINGS);
      setQuizPreferences(DEFAULT_QUIZ_PREFERENCES);
      setHasCompletedOnboarding(false);
      setShowOnboardingGuide(false);
      return;
    }

    if (cloudHydratedUserId.current !== currentUser.id) {
      loadUserCache(currentUser.id);
    }
  }, [currentUser?.id, isReady]);

  async function loadUserCache(userId: string) {
    try {
      achievementWalletLoadedUserId.current = null;
      setAchievementWallet(EMPTY_ACHIEVEMENT_WALLET);
      const [savedWords, savedQuiz, savedAnalytics, savedReminder, savedDailyQuizGoal, savedTimedLearning, savedTimeBasedLearningSettings, savedQuizPreferences, savedAchievementWallet, savedOnboarding, legacyOnboarding] =
        await Promise.all([
          AsyncStorage.getItem(getUserCacheKey(userId, 'words')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'quiz-progress')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'analytics')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'reminder-settings')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'daily-quiz-goal')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'timed-learning-enabled')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'time-based-learning-settings')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'quiz-preferences')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'achievement-wallet')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'onboarding-complete')),
          AsyncStorage.getItem(LEGACY_ONBOARDING_KEY),
        ]);

      const cachedWords = savedWords ? JSON.parse(savedWords) as Word[] : [];
      setWords(cachedWords.filter(isUserCreatedWord));
      setQuizProgress(savedQuiz ? JSON.parse(savedQuiz) : null);
      setAnalytics(savedAnalytics ? JSON.parse(savedAnalytics) : EMPTY_ANALYTICS);
      setReminderSettings(
        savedReminder
          ? { ...DEFAULT_REMINDER, ...JSON.parse(savedReminder) }
          : DEFAULT_REMINDER,
      );
      setDailyQuizGoal(clampDailyQuizGoal(Number(savedDailyQuizGoal) || 1));
      setTimedLearningEnabled(savedTimedLearning === 'true');
      setTimeBasedLearningSettings(
        savedTimeBasedLearningSettings
          ? {
              ...DEFAULT_TIME_BASED_LEARNING_SETTINGS,
              ...JSON.parse(savedTimeBasedLearningSettings),
            }
          : DEFAULT_TIME_BASED_LEARNING_SETTINGS,
      );
      const savedPreferences = savedQuizPreferences
        ? JSON.parse(savedQuizPreferences) as QuizPreferences
        : null;
      setQuizPreferences(savedPreferences
        ? {
            ...DEFAULT_QUIZ_PREFERENCES,
            ...savedPreferences,
            questionTypes: normalizeQuestionTypePreferences(
              savedPreferences.questionTypes,
            ),
          }
        : DEFAULT_QUIZ_PREFERENCES);
      const parsedWallet = savedAchievementWallet
        ? JSON.parse(savedAchievementWallet) as Partial<AchievementWallet>
        : null;
      setAchievementWallet({
        claimedAchievementIds: Array.isArray(parsedWallet?.claimedAchievementIds)
          ? parsedWallet.claimedAchievementIds
          : [],
        points: Math.max(0, Number(parsedWallet?.points) || 0),
        refreshTokens: Math.max(0, Number(parsedWallet?.refreshTokens) || 0),
      });
      const onboardingComplete =
        savedOnboarding === 'true' ||
        (savedOnboarding === null && legacyOnboarding === 'true');
      setHasCompletedOnboarding(onboardingComplete);
      if (onboardingComplete && savedOnboarding === null) {
        AsyncStorage.setItem(
          getUserCacheKey(userId, 'onboarding-complete'),
          'true',
        );
      }
      setShowOnboardingGuide(false);
      achievementWalletLoadedUserId.current = userId;
    } catch (error) {
      reportError(error, { area: 'load_user_cache' });
      setWords([]);
      setQuizProgress(null);
      setAnalytics(EMPTY_ANALYTICS);
      setAchievementWallet(EMPTY_ACHIEVEMENT_WALLET);
      setHasCompletedOnboarding(false);
      achievementWalletLoadedUserId.current = userId;
      setReminderSettings(DEFAULT_REMINDER);
      setDailyQuizGoal(1);
      setTimedLearningEnabled(false);
      setTimeBasedLearningSettings(DEFAULT_TIME_BASED_LEARNING_SETTINGS);
      setQuizPreferences(DEFAULT_QUIZ_PREFERENCES);
      setAppNotice('Saved data on this device could not be read. Please try again when you are connected.');
    }
  }

  useEffect(() => {
    if (!env.isSupabaseConfigured || !isReady || !currentUser) {
      return;
    }

    if (cloudHydratedUserId.current === currentUser.id) {
      return;
    }

    if (cloudHydratingUserId.current === currentUser.id) {
      return;
    }

    const userId = currentUser.id;
    let isActive = true;

    async function hydrateCloudData() {
      try {
        cloudHydratingUserId.current = userId;

        if (await loadFreshCloudCache(userId)) {
          cloudHydratedUserId.current = userId;
          logCloudSync('hydrate_skipped_fresh_cache', {
            cacheTtlMs: CLOUD_HYDRATE_CACHE_MS,
          });
          return;
        }

        setIsCloudLoading(true);
        setAppNotice(null);
        const cloudData = await fetchUserLearningData(
          userId,
          getScreenContext(activeTab, 'hydrate_learning_data'),
        );

        if (!isActive) {
          return;
        }

        if (cloudData.words.length > 0) {
          const localWords = latestWords.current.filter(isUserCreatedWord);
          const mergedWords = mergeWordLists(cloudData.words, localWords);
          setWords(mergedWords);
          setQuizProgress(cloudData.quizProgress);
          setAnalytics(cloudData.analytics);
          if (cloudData.reminderSettings) {
            setReminderSettings((currentSettings) => ({
              ...currentSettings,
              ...cloudData.reminderSettings,
            }));
          }
          syncMissingLocalWords(userId, localWords, cloudData.words);
        } else {
          setWords((currentWords) => currentWords.filter(isUserCreatedWord));
        }

        cloudHydratedUserId.current = userId;
        markCloudCacheFresh(userId);
      } catch (error) {
        reportError(error, { area: 'cloud_hydration' });
        trackEvent('cloud_sync_failed', { operation: 'hydrate' });
      } finally {
        if (cloudHydratingUserId.current === userId) {
          cloudHydratingUserId.current = null;
        }
        if (isActive) {
          setIsCloudLoading(false);
        }
      }
    }

    hydrateCloudData();

    return () => {
      isActive = false;
    };
  }, [currentUser?.id, isReady]);

  function syncMissingLocalWords(
    userId: string,
    localWords: Word[],
    cloudWords: Word[],
  ) {
    const cloudTerms = new Set(
      cloudWords.map((word) => word.term.trim().toLowerCase()),
    );
    const missingWords = localWords.filter(
      (word) => !cloudTerms.has(word.term.trim().toLowerCase()),
    );

    saveCloudWords(
      userId,
      missingWords,
      getScreenContext(activeTab, 'backfill_local_words'),
    ).catch((error) => {
      reportError(error, { area: 'backfill_word' });
      trackEvent('cloud_sync_failed', { operation: 'backfill_word' });
      deferCloudSync();
    });
  }

  async function loadFreshCloudCache(userId: string) {
    try {
      const [lastHydratedAt, savedWords] = await Promise.all([
        AsyncStorage.getItem(getUserCacheKey(userId, 'cloud-hydrated-at')),
        AsyncStorage.getItem(getUserCacheKey(userId, 'words')),
      ]);
      const hydratedAt = lastHydratedAt ? Number(lastHydratedAt) : 0;
      const cacheAgeMs = Date.now() - hydratedAt;

      if (!savedWords || !hydratedAt || cacheAgeMs > CLOUD_HYDRATE_CACHE_MS) {
        return false;
      }

      await loadUserCache(userId);
      return true;
    } catch (error) {
      reportError(error, { area: 'cloud_cache_check' });
      return false;
    }
  }

  function markCloudCacheFresh(userId: string) {
    AsyncStorage.setItem(
      getUserCacheKey(userId, 'cloud-hydrated-at'),
      String(Date.now()),
    ).catch((error) => {
      reportError(error, { area: 'cloud_cache_mark' });
    });
  }

  async function completeOnboarding(enableReminder: boolean, isReplay = false) {
    if (currentUser) {
      await AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'onboarding-complete'),
        'true',
      );
    }
    setHasCompletedOnboarding(true);
    setShowOnboardingGuide(false);
    if (!isReplay) {
      trackEvent('onboarding_completed', {
        enabledReminder: enableReminder,
      });
    }

    if (enableReminder) {
      await updateReminder({ ...reminderSettings, enabled: true });
    }
  }

  function openCards(wordId?: string, studyGroup?: 'flagged') {
    setInitialCardWordId(wordId ?? null);
    setInitialCardStudyGroup(studyGroup);
    setActiveTab('cards');
  }

  function presentPlusPaywall(
    reason: 'quiz' | 'word-limit' | 'premium-feature',
    action?: () => void,
  ) {
    if (canUseFullLearningAccess()) {
      action?.();
      return;
    }
    if (subscription.isAccessLoading || subscription.isLoading) {
      pendingPlusAction.current = action ?? null;
      return;
    }
    if (subscription.accessError) {
      Alert.alert(
        'Checking your access',
        'WordWiz could not verify your complimentary access yet. Please try again in a moment.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Retry', onPress: () => void subscription.refresh() },
        ],
      );
      return;
    }
    pendingPlusAction.current = action ?? null;
    setPlusPaywallReason(reason);
    setShowPlusPaywall(true);
  }

  function openQuiz(studyGroup?: 'flagged') {
    if (!canUseFullLearningAccess()) {
      presentPlusPaywall('quiz', () => openQuiz(studyGroup));
      return;
    }
    setInitialQuizStudyGroup(studyGroup);
    setActiveTab('quiz');
  }

  function openStudySetBuilder() {
    setOpenStudySetBuilderOnMount(true);
    setActiveTab('words');
  }

  function openFlaggedQuiz() {
    openQuiz('flagged');
  }

  function toggleWordFlag(wordId: string) {
    const previousWord = words.find((word) => word.id === wordId);
    if (!previousWord) return;

    setWordFlagState([wordId], !previousWord.isFlagged);
  }

  function setWordFlagState(wordIds: string[], isFlagged: boolean) {
    const wordIdSet = new Set(wordIds);
    const previousWords = words.filter(
      (word) => wordIdSet.has(word.id) && word.isFlagged !== isFlagged,
    );
    if (previousWords.length === 0) return;

    const flaggedAt = isFlagged ? new Date().toISOString() : undefined;
    const nextWords = previousWords.map((word) => ({
      ...word,
      isFlagged,
      flaggedAt,
    }));
    const nextWordsById = new Map(nextWords.map((word) => [word.id, word]));
    const previousWordsById = new Map(previousWords.map((word) => [word.id, word]));

    setWords((currentWords) =>
      currentWords.map((word) => nextWordsById.get(word.id) ?? word),
    );
    trackEvent('word_flag_toggled', { flagged: isFlagged, count: nextWords.length });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      saveCloudWords(
        currentUser.id,
        nextWords,
        getScreenContext(activeTab, 'set_word_flag_state'),
      )
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          reportError(error, { area: 'save_word_flag' });
          trackEvent('cloud_sync_failed', { operation: 'save_word_flag' });
          setWords((currentWords) =>
            currentWords.map((word) =>
              nextWordsById.has(word.id) &&
              word.isFlagged === isFlagged &&
              word.flaggedAt === flaggedAt
                ? previousWordsById.get(word.id) ?? word
                : word,
            ),
          );
          deferCloudSync();
        });
    }
  }

  function toggleWordFocus(wordId: string) {
    const previousWord = words.find((word) => word.id === wordId);
    if (!previousWord) return;

    const wasFocused = previousWord.mastery?.focusMode === true;
    const focusedAt = wasFocused ? undefined : new Date().toISOString();
    const nextWord: Word = {
      ...previousWord,
      mastery: {
        ...getWordMasteryProgress(previousWord, analytics),
        focusMode: !wasFocused,
        focusedAt,
      },
    };

    setWords((currentWords) =>
      currentWords.map((word) => (word.id === wordId ? nextWord : word)),
    );
    trackEvent('word_focus_toggled', { focused: !wasFocused });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      saveCloudWord(
        currentUser.id,
        nextWord,
        getScreenContext(activeTab, 'toggle_word_focus'),
      )
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          reportError(error, { area: 'save_word_focus' });
          trackEvent('cloud_sync_failed', { operation: 'save_word_focus' });
          setWords((currentWords) =>
            currentWords.map((word) =>
              word.id === wordId &&
              word.mastery?.focusMode === !wasFocused &&
              word.mastery?.focusedAt === focusedAt
                ? previousWord
                : word,
            ),
          );
          deferCloudSync();
        });
    }
  }

  async function createStudySet(name: string, wordIds: string[]) {
    const trimmedName = name.trim().replace(/\s+/g, ' ');
    const selectedWordIds = new Set(wordIds);
    if (!trimmedName || selectedWordIds.size === 0) {
      return false;
    }

    const membership = {
      id: createUuid(),
      name: trimmedName,
      createdAt: new Date().toISOString(),
      kind: 'custom' as const,
    };
    const previousWords = words.filter((word) => selectedWordIds.has(word.id));
    const nextWords = previousWords.map((word) => ({
      ...word,
      mastery: {
        ...getWordMasteryProgress(word, analytics),
        studySets: [
          ...(word.mastery?.studySets ?? []),
          membership,
        ],
      },
    }));
    const nextWordsById = new Map(nextWords.map((word) => [word.id, word]));
    const previousWordsById = new Map(previousWords.map((word) => [word.id, word]));

    setWords((currentWords) =>
      currentWords.map((word) => nextWordsById.get(word.id) ?? word),
    );
    trackEvent('study_set_created', { wordCount: nextWords.length });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      try {
        await saveCloudWords(
          currentUser.id,
          nextWords,
          getScreenContext('words', 'create_study_set'),
        );
        markCloudCacheFresh(currentUser.id);
      } catch (error) {
        reportError(error, { area: 'save_study_set' });
        trackEvent('cloud_sync_failed', { operation: 'save_study_set' });
        setWords((currentWords) =>
          currentWords.map((word) => nextWordsById.has(word.id)
            ? previousWordsById.get(word.id) ?? word
            : word),
        );
        deferCloudSync();
        return false;
      }
    }

    return true;
  }

  async function deleteStudySet(studySetId: string) {
    const previousWords = words.filter((word) =>
      word.mastery?.studySets?.some((set) => set.id === studySetId),
    );
    if (previousWords.length === 0) return true;

    const nextWords = previousWords.map((word) => ({
      ...word,
      mastery: {
        ...getWordMasteryProgress(word, analytics),
        studySets: (word.mastery?.studySets ?? []).filter(
          (set) => set.id !== studySetId,
        ),
      },
    }));
    const nextWordsById = new Map(nextWords.map((word) => [word.id, word]));
    const previousWordsById = new Map(
      previousWords.map((word) => [word.id, word]),
    );

    setWords((currentWords) =>
      currentWords.map((word) => nextWordsById.get(word.id) ?? word),
    );

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      try {
        const membership = previousWords
          .flatMap((word) => word.mastery?.studySets ?? [])
          .find((set) => set.id === studySetId);
        if (membership) {
          await saveCloudStudySetMembership(
            previousWords.map((word) => word.id),
            membership,
            false,
          );
        } else {
          await saveCloudWords(
          currentUser.id,
          nextWords,
          getScreenContext('words', 'delete_study_set'),
          );
        }
        markCloudCacheFresh(currentUser.id);
      } catch (error) {
        reportError(error, { area: 'delete_study_set' });
        trackEvent('cloud_sync_failed', { operation: 'delete_study_set' });
        setWords((currentWords) =>
          currentWords.map((word) =>
            nextWordsById.has(word.id)
              ? previousWordsById.get(word.id) ?? word
              : word,
          ),
        );
        deferCloudSync();
        return false;
      }
    }

    return true;
  }

  function toggleWordReviewNext(wordId: string) {
    const previousWord = words.find((word) => word.id === wordId);
    if (!previousWord) return;

    const wasQueued = previousWord.mastery?.reviewNext === true;
    const reviewNextAt = wasQueued ? undefined : new Date().toISOString();
    const nextWord: Word = {
      ...previousWord,
      mastery: {
        ...getWordMasteryProgress(previousWord, analytics),
        reviewNext: !wasQueued,
        reviewNextAt,
      },
    };

    setWords((currentWords) =>
      currentWords.map((word) => (word.id === wordId ? nextWord : word)),
    );
    trackEvent('word_review_next_toggled', { queued: !wasQueued });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      saveCloudWord(
        currentUser.id,
        nextWord,
        getScreenContext(activeTab, 'toggle_word_review_next'),
      )
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          reportError(error, { area: 'save_word_review_next' });
          trackEvent('cloud_sync_failed', { operation: 'save_word_review_next' });
          setWords((currentWords) =>
            currentWords.map((word) =>
              word.id === wordId &&
              word.mastery?.reviewNext === !wasQueued &&
              word.mastery?.reviewNextAt === reviewNextAt
                ? previousWord
                : word,
            ),
          );
          deferCloudSync();
        });
    }
  }

  function toggleWordPracticeExclusion(wordId: string) {
    const previousWord = words.find((word) => word.id === wordId);
    if (!previousWord) return;

    const wasExcluded = previousWord.mastery?.excludedFromPractice === true;
    const excludedFromPracticeAt = wasExcluded ? undefined : new Date().toISOString();
    const nextWord: Word = {
      ...previousWord,
      mastery: {
        ...getWordMasteryProgress(previousWord, analytics),
        excludedFromPractice: !wasExcluded,
        excludedFromPracticeAt,
      },
    };

    setWords((currentWords) =>
      currentWords.map((word) => (word.id === wordId ? nextWord : word)),
    );
    trackEvent('word_practice_exclusion_toggled', { excluded: !wasExcluded });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      saveCloudWord(
        currentUser.id,
        nextWord,
        getScreenContext(activeTab, 'toggle_word_practice_exclusion'),
      )
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          reportError(error, { area: 'save_word_practice_exclusion' });
          trackEvent('cloud_sync_failed', { operation: 'save_word_practice_exclusion' });
          setWords((currentWords) =>
            currentWords.map((word) =>
              word.id === wordId &&
              word.mastery?.excludedFromPractice === !wasExcluded &&
              word.mastery?.excludedFromPracticeAt === excludedFromPracticeAt
                ? previousWord
                : word,
            ),
          );
          deferCloudSync();
        });
    }
  }

  function openAddWord() {
    if (!canUseFullLearningAccess() && !subscription.canAddWord) {
      presentPlusPaywall('word-limit', openAddWord);
      return;
    }
    setWordToEdit(null);
    setShowAddWord(true);
  }

  function openEditWord(word: Word) {
    setWordToEdit(word);
    setShowAddWord(true);
  }

  function closeWordModal() {
    setShowAddWord(false);
    setWordToEdit(null);
  }

  useEffect(() => {
    if (isReady && currentUser) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'words'),
        JSON.stringify(words),
      );
    }
  }, [currentUser, isReady, words]);

  useEffect(() => {
    if (isReady && currentUser) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'quiz-progress'),
        JSON.stringify(quizProgress),
      );
    }
  }, [currentUser, isReady, quizProgress]);

  useEffect(() => {
    if (isReady && currentUser) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'analytics'),
        JSON.stringify(analytics),
      );
    }
  }, [analytics, currentUser, isReady]);

  useEffect(() => {
    if (isReady && currentUser) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'reminder-settings'),
        JSON.stringify(reminderSettings),
      );
    }
  }, [currentUser, isReady, reminderSettings]);

  useEffect(() => {
    if (isReady && currentUser) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'daily-quiz-goal'),
        String(dailyQuizGoal),
      );
    }
  }, [currentUser, dailyQuizGoal, isReady]);

  useEffect(() => {
    if (isReady && currentUser) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'timed-learning-enabled'),
        String(timedLearningEnabled),
      );
    }
  }, [currentUser, isReady, timedLearningEnabled]);

  useEffect(() => {
    if (isReady && currentUser) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'time-based-learning-settings'),
        JSON.stringify(timeBasedLearningSettings),
      );
    }
  }, [currentUser, isReady, timeBasedLearningSettings]);

  useEffect(() => {
    if (isReady && currentUser) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'quiz-preferences'),
        JSON.stringify(quizPreferences),
      );
    }
  }, [currentUser, isReady, quizPreferences]);

  useEffect(() => {
    if (
      !isReady ||
      !currentUser ||
      achievementWalletLoadedUserId.current !== currentUser.id
    ) {
      return;
    }

    const newlyUnlocked = currentAchievements.filter(
      (achievement) =>
        achievement.unlocked &&
        !achievementWallet.claimedAchievementIds.includes(achievement.id),
    );
    if (newlyUnlocked.length === 0) {
      return;
    }

    setAchievementWallet((currentWallet) => {
      const claimable = newlyUnlocked.filter(
        (achievement) => !currentWallet.claimedAchievementIds.includes(achievement.id),
      );
      if (claimable.length === 0) {
        return currentWallet;
      }

      return {
        claimedAchievementIds: [
          ...currentWallet.claimedAchievementIds,
          ...claimable.map((achievement) => achievement.id),
        ],
        points: currentWallet.points + claimable.reduce(
          (total, achievement) => total + achievement.points,
          0,
        ),
        refreshTokens: currentWallet.refreshTokens + claimable.reduce(
          (total, achievement) => total + achievement.refreshTokens,
          0,
        ),
      };
    });
  }, [achievementWallet.claimedAchievementIds, currentAchievements, currentUser, isReady]);

  useEffect(() => {
    if (isReady && currentUser && achievementWalletLoadedUserId.current === currentUser.id) {
      AsyncStorage.setItem(
        getUserCacheKey(currentUser.id, 'achievement-wallet'),
        JSON.stringify(achievementWallet),
      );
    }
  }, [achievementWallet, currentUser, isReady]);

  const sortedWords = useMemo(() => {
    return [...words].sort((first, second) => {
      if (sortMode === 'recent') {
        return second.createdAt.localeCompare(first.createdAt);
      }

      return first.term.localeCompare(second.term);
    });
  }, [sortMode, words]);

  const todayQuizProgress =
    quizProgress?.date === currentDayKey ? quizProgress : null;

  function useAchievementRefreshToken() {
    if (achievementWallet.refreshTokens < 1) {
      return false;
    }
    setAchievementWallet((currentWallet) => ({
      ...currentWallet,
      refreshTokens: Math.max(0, currentWallet.refreshTokens - 1),
    }));
    return true;
  }

  async function login(email: string, password: string) {
    if (!ensureSupabaseReady()) {
      return false;
    }

    const cleanEmail = normalizeEmail(email);
    const emailError = validateEmail(cleanEmail);
    const passwordError = validatePassword(password);

    if (emailError || passwordError) {
      Alert.alert(
        'Could not log in',
        'Check your email and password.',
      );
      return false;
    }

    try {
      const user = await signInWithSupabase(
        cleanEmail,
        password,
        { screen: 'Login', reason: 'password_login' },
      );
      if (user) {
        setCurrentUser(user);
      }
      return Boolean(user);
    } catch {
      Alert.alert(
        'Could not log in',
        'Check your email and password. If email confirmation is on, confirm your email first.',
      );
      return false;
    }
  }

  async function createAccount(name: string, email: string, password: string) {
    if (!ensureSupabaseReady()) {
      return false;
    }

    const cleanEmail = normalizeEmail(email);
    const nameError = validateName(name);
    const emailError = validateEmail(cleanEmail);
    const passwordError = validatePassword(password);

    const validationError = nameError ?? emailError ?? passwordError;
    if (validationError) {
      Alert.alert('Check your account details', validationError);
      return false;
    }

    try {
      const result = await signUpWithSupabase({
        name,
        email: cleanEmail,
        password,
        context: { screen: 'Login', reason: 'create_account' },
      });
      await AsyncStorage.removeItem(LEGACY_ONBOARDING_KEY);

      if (result.needsEmailVerification) {
        Alert.alert(
          'Check your email',
          'We sent you a verification link. Confirm it to return to WordWiz and finish signing in.',
        );
        return true;
      }

      if (result.user) {
        setCurrentUser(result.user);
      }

      return true;
    } catch {
      Alert.alert(
        'Could not create account',
        'Try logging in or use a different email.',
      );
      return false;
    }
  }

  async function resendVerification(email: string) {
    if (!ensureSupabaseReady()) {
      return false;
    }

    const emailError = validateEmail(email);

    if (emailError) {
      Alert.alert('Check your email', emailError);
      return false;
    }

    try {
      await resendSupabaseEmailVerification(
        email,
        { screen: 'Login', reason: 'resend_verification' },
      );
      Alert.alert(
        'Verification sent',
        'Check your inbox for a fresh WordWiz confirmation link.',
      );
      return true;
    } catch {
      Alert.alert(
        'Could not resend',
        'Try again in a minute, or check whether this email already has an account.',
      );
      return false;
    }
  }

  async function forgotPassword(email: string) {
    if (!ensureSupabaseReady()) {
      return;
    }

    const emailError = validateEmail(email);

    if (emailError) {
      Alert.alert('Check your email', emailError);
      return;
    }

    try {
      await sendSupabasePasswordReset(
        email,
        { screen: 'Login', reason: 'password_reset' },
      );
    } catch {
      // Keep this response generic so the UI does not reveal whether an email exists.
    } finally {
      Alert.alert(
        'Reset email requested',
        'If an account exists for that email, Supabase will send password reset instructions.',
      );
    }
  }

  async function loginWithOAuth(provider: Provider, label: string) {
    if (!ensureSupabaseReady()) {
      return false;
    }

    try {
      const user = await signInWithOAuthProvider(
        provider,
        { screen: 'Login', reason: `${label.toLowerCase()}_oauth_login` },
      );
      if (user) {
        setCurrentUser(user);
      }
      return true;
    } catch {
      Alert.alert(
        `${label} sign-in unavailable`,
        `Make sure the ${label} provider is enabled in Supabase and try again.`,
      );
      return false;
    }
  }

  async function logout() {
    if (!env.isSupabaseConfigured) {
      setCurrentUser(null);
      cloudHydratedUserId.current = null;
      cloudHydratingUserId.current = null;
      setActiveTab('home');
      return;
    }

    try {
      await signOutWithSupabase({ screen: 'Dashboard', reason: 'logout' });
    } catch {
      Alert.alert('Could not log out', 'Please try again.');
    } finally {
      setCurrentUser(null);
      cloudHydratedUserId.current = null;
      cloudHydratingUserId.current = null;
      setActiveTab('home');
    }
  }

  function deleteAccount() {
    if (!ensureSupabaseReady()) {
      return;
    }

    Alert.alert(
      'Delete your account?',
      'This permanently removes your WordWiz account and cloud learning data. This cannot be undone.',
      [
        { text: 'Keep account', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: confirmDeleteAccount,
        },
      ],
    );
  }

  async function confirmDeleteAccount() {
    const deletingUserId = currentUser?.id;

    try {
      await requestSupabaseAccountDeletion({
        screen: 'Dashboard',
        reason: 'delete_account',
      });
      try {
        await signOutWithSupabase({
          screen: 'Dashboard',
          reason: 'delete_account_cleanup',
        });
      } catch {
        // The account is already deleted server-side, so the local session can be cleared by state reset below.
      }
      if (deletingUserId) {
        await clearLocalLearningData(deletingUserId);
      }
      cloudHydratedUserId.current = null;
      cloudHydratingUserId.current = null;
      setCurrentUser(null);
      setWords([]);
      setQuizProgress(null);
      setAnalytics(EMPTY_ANALYTICS);
      setReminderSettings(DEFAULT_REMINDER);
      setDailyQuizGoal(1);
      setActiveTab('home');
      Alert.alert(
        'Account deleted',
        'Your WordWiz account deletion request was completed.',
      );
    } catch {
      Alert.alert(
        'Could not delete account',
        'Your account was not deleted. Please try again, or contact howardlt94@gmail.com if the problem continues.',
      );
    }
  }

  async function addWord(
    term: string,
    definition: string,
    example: string,
    details: Partial<WordDetails> = {},
    options: { closeAfterSave?: boolean } = {},
  ): Promise<boolean | 'duplicate' | 'save_failed'> {
    if (isSavingWord.current) {
      return false;
    }
    const cleanTerm = term.trim().replace(/\s+/g, ' ');
    const isReplacingStarterWord = STARTER_WORDS.some(
      (starterWord) =>
        getSavedWordTermKey(starterWord.term) === getSavedWordTermKey(cleanTerm),
    );
    const existingWord = words.find(
      (word) => getSavedWordTermKey(word.term) === getSavedWordTermKey(cleanTerm),
    );
    if (existingWord && wordToEdit?.id !== existingWord.id) {
      return 'duplicate';
    }
    const isEditingExistingWord = Boolean(
      wordToEdit &&
        existingWord &&
        wordToEdit.id === existingWord.id &&
        !isReplacingStarterWord,
    );
    const wordData = buildWordFromInput({
      existingWord: isReplacingStarterWord ? undefined : existingWord,
      term: cleanTerm,
      definition,
      example,
      details,
      id: createUuid(),
      createdAt: new Date().toISOString(),
    });
    let savedWord = wordData;

    if (!currentUser) {
      Alert.alert('Sign in required', 'Sign in before saving a new word.');
      return false;
    }

    isSavingWord.current = true;
    try {
      if (!isEditingExistingWord) {
        if (!canUseFullLearningAccess() && !subscription.canAddWord) {
          presentPlusPaywall('word-limit', openAddWord);
          return false;
        }
        savedWord = await createCloudWordWithFreeLimit(wordData);
        // The word has already been saved at this point. Refreshing the
        // complimentary-access display is helpful, but a temporary failure
        // there must never turn a successful save into a failed one.
        try {
          await subscription.refreshAccess();
        } catch (error) {
          reportError(error, { area: 'refresh_access_after_word_save' });
          trackEvent('cloud_sync_failed', { operation: 'refresh_access_after_word_save' });
        }
      } else {
        savedWord = await saveCloudWord(
          currentUser.id,
          wordData,
          getScreenContext(activeTab, 'edit_word'),
        );
      }
      markCloudCacheFresh(currentUser.id);
    } catch (error) {
      if (error instanceof FreeWordLimitError) {
        void subscription.refreshAccess();
        presentPlusPaywall('word-limit', openAddWord);
        return false;
      }
      if (error instanceof DuplicateWordError) {
        return 'duplicate';
      }
      reportError(error, { area: 'save_word' });
      trackEvent('cloud_sync_failed', { operation: 'save_word' });
      return 'save_failed';
    } finally {
      isSavingWord.current = false;
    }

    setWords((currentWords) => upsertSavedWord(currentWords, savedWord));
    trackEvent('word_saved', {
      updatedExisting: isEditingExistingWord,
      hasSimpleDefinition: Boolean(savedWord.simpleDefinition),
    });
    if (options.closeAfterSave !== false) {
      setShowAddWord(false);
      setWordToEdit(null);
      setActiveTab('words');
    }
    return true;
  }

  async function enrichStarterCollectionWords(initialWords: Word[]) {
    if (!currentUser || initialWords.length === 0) {
      return;
    }
    const userId = currentUser.id;

    const wordsToEnrich = initialWords.filter((word) => {
      if (starterCollectionEnrichmentIds.current.has(word.id)) {
        return false;
      }
      starterCollectionEnrichmentIds.current.add(word.id);
      return true;
    });

    async function enrichWord(initialWord: Word) {
      try {
        const details = await lookupWordDetails(initialWord.term);
        const currentWord = latestWords.current.find(
          (word) => word.id === initialWord.id,
        );
        if (!currentWord) {
          return;
        }

        // Keep the curated definition and example as the collection's clear
        // learning path, while the lookup fills the optional reference fields.
        const enrichedWord = buildWordFromInput({
          existingWord: currentWord,
          term: currentWord.term,
          definition: currentWord.definition,
          example: currentWord.example,
          details: {
            ...details,
            simpleDefinition:
              currentWord.simpleDefinition ?? details.simpleDefinition,
            partOfSpeech: currentWord.partOfSpeech ?? details.partOfSpeech,
            commonWords: currentWord.commonWords?.length
              ? currentWord.commonWords
              : details.commonWords,
            basicInfo: currentWord.basicInfo ?? details.basicInfo,
          },
          id: currentWord.id,
          createdAt: currentWord.createdAt,
        });

        setWords((currentWords) => upsertSavedWord(currentWords, enrichedWord));
        await saveCloudWord(
          userId,
          enrichedWord,
          getScreenContext('words', 'enrich_wordwiz_collection_word'),
        );
        markCloudCacheFresh(userId);
      } catch (error) {
        // Enrichment is additive. A temporary lookup failure never affects the
        // usable, curated word that was already added to the collection.
        reportError(error, { area: 'enrich_wordwiz_collection_word' });
      } finally {
        starterCollectionEnrichmentIds.current.delete(initialWord.id);
      }
    }

    // Two lookups at a time keeps the collection responsive without flooding
    // its dictionary sources when someone adds a large deck.
    for (let index = 0; index < wordsToEnrich.length; index += 2) {
      await Promise.all(
        wordsToEnrich
          .slice(index, index + 2)
          .map((word) => enrichWord(word)),
      );
    }
  }

  async function addStarterCollection(collection: WordWizStarterCollection) {
    if (!currentUser) {
      Alert.alert('Sign in required', 'Sign in before adding a WordWiz collection.');
      return { added: 0, alreadySaved: 0, blocked: true };
    }

    const collectionSetId = `wordwiz-collection:${collection.id}`;
    const existingCollectionWords = words.filter((word) =>
      collection.words.some(
        (collectionWord) =>
          collectionWord.term.trim().toLowerCase() === word.term.trim().toLowerCase(),
      ),
    );
    const existingMembership = existingCollectionWords
      .flatMap((word) => word.mastery?.studySets ?? [])
      .find((set) => set.id === collectionSetId);
    const membership: StudySetMembership = existingMembership ?? {
      id: collectionSetId,
      name: collection.title,
      createdAt: new Date().toISOString(),
      kind: 'collection',
    };
    const existingTerms = new Set(words.map((word) => word.term.trim().toLowerCase()));
    const newCollectionWords = collection.words.filter(
      (collectionWord) => !existingTerms.has(collectionWord.term.trim().toLowerCase()),
    );
    const alreadySaved = existingCollectionWords.length;
    if (newCollectionWords.length > 0 && !canUseFullLearningAccess()) {
      presentPlusPaywall('premium-feature');
      return { added: 0, alreadySaved, blocked: true };
    }
    const existingWordsMissingMembership = existingCollectionWords.filter(
      (word) => !word.mastery?.studySets?.some((set) => set.id === collectionSetId),
    );
    const wordsToCreate = newCollectionWords.map((collectionWord) => {
      const createdAt = new Date().toISOString();
      const wordData = buildWordFromInput({
        term: collectionWord.term,
        definition: collectionWord.definition,
        example: collectionWord.example,
        details: {
          simpleDefinition: collectionWord.definition,
          partOfSpeech: collectionWord.partOfSpeech,
          commonWords: collectionWord.group ? [collectionWord.group] : [],
          basicInfo: collectionWord.group
            ? `Part of the “${collectionWord.group}” group. Notice the difference while you practice.`
            : `Part of the WordWiz “${collection.title}” collection.`,
        },
        id: createUuid(),
        createdAt,
      });
      return {
        ...wordData,
        mastery: {
          ...getWordMasteryProgress(wordData, analytics),
          studySets: [membership],
        },
      };
    });

    const nextExistingWords = existingWordsMissingMembership.map((word) => ({
      ...word,
      mastery: {
        ...getWordMasteryProgress(word, analytics),
        studySets: [...(word.mastery?.studySets ?? []), membership],
      },
    }));
    const nextExistingWordsById = new Map(
      nextExistingWords.map((word) => [word.id, word]),
    );
    const originalExistingWordsById = new Map(
      existingWordsMissingMembership.map((word) => [word.id, word]),
    );
    const createdWordIds = new Set(wordsToCreate.map((word) => word.id));
    let savedWords: Word[] = [];

    // Show the complete deck immediately. The cloud batch below remains the
    // source of truth, but waiting for a large collection before updating the
    // UI made the action feel like the app had frozen.
    if (wordsToCreate.length > 0 || nextExistingWords.length > 0) {
      setWords((currentWords) => {
        const currentIds = new Set(currentWords.map((word) => word.id));
        return [
          ...currentWords.map((word) => nextExistingWordsById.get(word.id) ?? word),
          ...wordsToCreate.filter((word) => !currentIds.has(word.id)),
        ];
      });
    }

    try {
      if (wordsToCreate.length > 0) {
        // Save through the same server-enforced path used for an individual
        // word. This keeps collections reliable even if the optional bulk RPC
        // has not been deployed to a production Supabase project yet.
        for (let index = 0; index < wordsToCreate.length; index += 4) {
          const batch = wordsToCreate.slice(index, index + 4);
          const results = await Promise.allSettled(
            batch.map(createCloudWordWithFreeLimit),
          );
          savedWords.push(
            ...results.flatMap((result) =>
              result.status === 'fulfilled' ? [result.value] : [],
            ),
          );
          const failedSave = results.find(
            (result): result is PromiseRejectedResult => result.status === 'rejected',
          );
          if (failedSave) throw failedSave.reason;
        }
      }

      if (nextExistingWords.length > 0) {
        try {
          await saveCloudStudySetMembership(
            nextExistingWords.map((word) => word.id),
            membership,
            true,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : '';
          const membershipEndpointIsUnavailable = /set_study_set_membership|schema cache/i.test(message);
          if (!membershipEndpointIsUnavailable) throw error;
          await saveCloudWords(
            currentUser.id,
            nextExistingWords,
            getScreenContext('words', 'add_wordwiz_collection'),
          );
        }
      }
    } catch (error) {
      const savedWordIds = new Set(savedWords.map((word) => word.id));
      setWords((currentWords) =>
        currentWords
          .filter((word) => !createdWordIds.has(word.id) || savedWordIds.has(word.id))
          .map((word) => originalExistingWordsById.get(word.id) ?? word),
      );
      if (savedWords.length > 0) {
        setWords((currentWords) =>
          savedWords.reduce((nextWords, savedWord) => upsertSavedWord(nextWords, savedWord), currentWords),
        );
      }
      if (error instanceof FreeWordLimitError) {
        await subscription.refreshAccess();
        presentPlusPaywall('word-limit');
        return { added: savedWords.length, alreadySaved, blocked: true };
      }
      reportError(error, { area: 'add_wordwiz_collection' });
      trackEvent('cloud_sync_failed', { operation: 'add_wordwiz_collection' });
      Alert.alert(
        'Could not finish the collection',
        savedWords.length
          ? `${savedWords.length} words were added. Please try again to add the rest.`
          : 'Please check your connection and try again.',
      );
      return { added: savedWords.length, alreadySaved, blocked: true };
    }

    setWords((currentWords) =>
      savedWords.reduce(
        (nextWords, savedWord) => upsertSavedWord(nextWords, savedWord),
        currentWords.map((word) => nextExistingWordsById.get(word.id) ?? word),
      ),
    );
    if (wordsToCreate.length > 0) {
      void enrichStarterCollectionWords(wordsToCreate);
    }
    if (wordsToCreate.length > 0) await subscription.refreshAccess();
    markCloudCacheFresh(currentUser.id);
    trackEvent('wordwiz_collection_added', {
      collection: collection.id,
      added: savedWords.length,
    });
    return {
      added: savedWords.length,
      alreadySaved,
      enrichmentScheduled: wordsToCreate.length > 0,
    };
  }

  useEffect(() => {
    if (
      activeTab === 'quiz' &&
      currentUser &&
      !subscription.isLoading &&
      !canUseFullLearningAccess()
    ) {
      setActiveTab('home');
      presentPlusPaywall('quiz', () => openQuiz());
    }
  }, [activeTab, currentUser, hasFullLearningAccess, subscription.isLoading]);

  function removeWord(wordToRemove: Word) {
    setWords((currentWords) =>
      currentWords.filter((word) => word.id !== wordToRemove.id),
    );

    if (
      currentUser &&
      cloudHydratedUserId.current === currentUser.id &&
      !isStarterWordId(wordToRemove.id)
    ) {
      deleteCloudWord(
        currentUser.id,
        wordToRemove.id,
        getScreenContext(activeTab, 'delete_word'),
      )
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          reportError(error, { area: 'delete_word' });
          trackEvent('cloud_sync_failed', { operation: 'delete_word' });
          deferCloudSync();
        });
    }
    trackEvent('word_deleted');
  }

  function confirmRemoveWord(word: Word) {
    setWordToRemove(word);
  }

  function recordCardReview(
    wordId: string,
    remembered: boolean,
    durationSeconds: number,
  ) {
    const studiedAt = new Date().toISOString();
    const event = {
      id: createUuid(),
      wordId,
      date: getDayKey(),
      studiedAt,
      remembered,
      durationSeconds,
    };
    const updatedWords = applyFlashcardReview(
      words,
      wordId,
      remembered,
      analytics,
      new Date(studiedAt),
    );
    const updatedWord = updatedWords.find((word) => word.id === wordId);

    setWords(updatedWords);
    setAnalytics((currentAnalytics) => ({
      ...currentAnalytics,
      cardHistory: [
        event,
        ...currentAnalytics.cardHistory,
      ].slice(0, 80),
    }));
    trackEvent('card_review_recorded', { remembered });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      Promise.all([
        saveCloudCardReview(
          currentUser.id,
          event,
          getScreenContext('cards', 'record_card_review'),
        ),
        updatedWord
          ? saveCloudWord(
              currentUser.id,
              updatedWord,
              getScreenContext('cards', 'update_flashcard_schedule'),
            )
          : Promise.resolve(),
      ])
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          reportError(error, { area: 'save_card_review' });
          trackEvent('cloud_sync_failed', { operation: 'save_card_review' });
          deferCloudSync();
        });
    }
  }

  async function completeQuiz(
    score: number,
    total: number,
    durationSeconds: number,
    answers: QuizAnswer[],
    options: { isDailyScoreRetry?: boolean } = {},
  ) {
    if (!canUseFullLearningAccess()) {
      presentPlusPaywall('quiz');
      return;
    }
    const { progress, attempt } = buildQuizCompletion({
      score,
      total,
      durationSeconds,
      answers,
      id: createUuid(),
      completedAt: new Date().toISOString(),
    });

    setQuizProgress((currentProgress) => {
      if (currentProgress?.date !== progress.date) {
        return progress;
      }

      if (!options.isDailyScoreRetry) {
        return currentProgress;
      }

      const currentAccuracy = currentProgress.total
        ? currentProgress.score / currentProgress.total
        : 0;
      const retryAccuracy = progress.total ? progress.score / progress.total : 0;
      return retryAccuracy >= currentAccuracy ? progress : currentProgress;
    });
    const updatedWords = applyQuizMastery(words, answers, analytics);
    setWords(updatedWords);
    setQuizPriorityWordIds([]);
    setAnalytics((currentAnalytics) => addQuizAttempt(currentAnalytics, attempt));
    trackEvent('quiz_completed', { score, total, durationSeconds });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      const reviewUpdates = answers
        .map((answer) => updatedWords.find((word) => word.id === answer.wordId))
        .filter(
          (word): word is Word =>
            word !== undefined && !isStarterWordId(word.id),
        );
      const uniqueReviewUpdates = Array.from(
        new Map(reviewUpdates.map((word) => [word.id, word])).values(),
      );

      Promise.all([
        saveCloudQuizAttempt(
          currentUser.id,
          attempt,
          getScreenContext('quiz', 'complete_quiz'),
        ),
        saveCloudWords(
          currentUser.id,
          uniqueReviewUpdates,
          getScreenContext('quiz', 'update_quiz_mastery'),
        ),
      ])
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          reportError(error, { area: 'save_quiz' });
          trackEvent('cloud_sync_failed', { operation: 'save_quiz' });
          deferCloudSync();
        });
    }
  }

  function openDueReview(priorityWordIds: string[] = []) {
    if (!canUseFullLearningAccess()) {
      presentPlusPaywall('quiz', () => openDueReview(priorityWordIds));
      return;
    }
    setInitialQuizStudyGroup(undefined);
    const dueReviews = getDueReviewWords(words, analytics);
    const dueWordIds = dueReviews.map((item) => item.word.id);
    const dueWordIdSet = new Set(dueWordIds);
    const queuedDueWordIds = Array.from(new Set(priorityWordIds)).filter(
      (wordId) => dueWordIdSet.has(wordId),
    );
    const queuedWordIdSet = new Set(queuedDueWordIds);
    const focusedDueWordIds = dueReviews
      .filter((item) => item.word.mastery?.focusMode === true)
      .map((item) => item.word.id)
      .filter((wordId) => !queuedWordIdSet.has(wordId));
    const focusedDueWordIdSet = new Set(focusedDueWordIds);
    setQuizPriorityWordIds([
      ...queuedDueWordIds,
      ...focusedDueWordIds,
      ...dueWordIds.filter(
        (wordId) =>
          !queuedWordIdSet.has(wordId) && !focusedDueWordIdSet.has(wordId),
      ),
    ]);
    setActiveTab('quiz');
  }

  async function updateReminder(nextSettings: ReminderSettings) {
    try {
      if (!nextSettings.enabled) {
        await cancelReminder(reminderSettings);
        const disabledSettings = {
          ...nextSettings,
          notificationId: undefined,
          notificationIds: undefined,
        };
        lastReminderRefreshKey.current = null;
        setReminderSettings(disabledSettings);
        saveReminderToCloud(disabledSettings);
        trackEvent('reminder_updated', { enabled: false });
        return;
      }

      if (Platform.OS === 'web') {
        setReminderSettings(nextSettings);
        saveReminderToCloud(nextSettings);
        Alert.alert(
          'Reminder saved',
          'Daily device notifications are available on iOS and Android.',
        );
        trackEvent('reminder_updated', { enabled: true, platform: 'web' });
        return;
      }

      const scheduledSettings = await scheduleDailyReminder(
        nextSettings,
        smartReminderMessages,
      );
      lastReminderRefreshKey.current = `${scheduledSettings.hour}:${scheduledSettings.minute}:${JSON.stringify(smartReminderContext)}`;
      setReminderSettings(scheduledSettings);
      saveReminderToCloud(scheduledSettings);
      trackEvent('reminder_updated', {
        enabled: true,
        hour: scheduledSettings.hour,
        minute: scheduledSettings.minute,
      });
    } catch (error) {
      reportError(error, { area: 'schedule_reminder' });
      setReminderSettings(nextSettings);
      saveReminderToCloud(nextSettings);
      Alert.alert(
        'Reminder saved',
        'WordWiz saved the time, but could not schedule a device notification yet.',
      );
    }
  }

  function saveReminderToCloud(settings: ReminderSettings) {
    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      saveCloudReminderSettings(
        currentUser.id,
        settings,
        getScreenContext('dashboard', 'save_reminder_settings'),
      )
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          reportError(error, { area: 'save_reminder_settings' });
          trackEvent('cloud_sync_failed', { operation: 'save_reminder' });
          deferCloudSync();
        });
    }
  }

  function deferCloudSync() {
    if (!currentUser) {
      return;
    }

    AsyncStorage.removeItem(
      getUserCacheKey(currentUser.id, 'cloud-hydrated-at'),
    ).catch((error) => {
      reportError(error, { area: 'cloud_cache_invalidate' });
    });
  }

  function ensureSupabaseReady() {
    if (env.isSupabaseConfigured) {
      return true;
    }

    Alert.alert(
      'Supabase setup needed',
      env.configurationError ??
        'Add the WordWiz Supabase environment variables before using accounts and cloud sync.',
    );
    return false;
  }

  function renderScreen() {
    if (activeTab === 'home') {
      return (
        <HomeScreen
          words={words}
          analytics={analytics}
          reminderSettings={reminderSettings}
          dailyQuizGoal={dailyQuizGoal}
          onAddWord={openAddWord}
          onStudy={() => openCards()}
          onReviewWord={(wordId) => openCards(wordId)}
          onQuiz={() => openQuiz()}
          onStats={() => setActiveTab('dashboard')}
          complimentaryAccess={subscription.hasActiveComplimentaryAccess ? {
            expiresAt: subscription.complimentaryExpiresAt,
            daysRemaining: subscription.complimentaryDaysRemaining,
          } : null}
        />
      );
    }

    if (activeTab === 'words') {
      return (
        <WordsScreen
          words={sortedWords}
          sortMode={sortMode}
          onChangeSort={setSortMode}
          onAdd={openAddWord}
          onRemove={confirmRemoveWord}
          onStudy={() => openCards()}
          onOpenPlus={() => presentPlusPaywall('word-limit')}
          onToggleFlag={toggleWordFlag}
          onSelectWord={(word) => openCards(word.id)}
          onTogglePracticeExclusion={toggleWordPracticeExclusion}
          onAddStarterCollection={addStarterCollection}
          onCreateStudySet={createStudySet}
          onDeleteStudySet={deleteStudySet}
          openStudySetBuilderOnMount={openStudySetBuilderOnMount}
          onStudySetBuilderOpened={() => setOpenStudySetBuilderOnMount(false)}
          freeWordUsage={hasFullLearningAccess ? null : freeWordUsage}
        />
      );
    }

    if (activeTab === 'cards') {
      return (
        <CardsScreen
          words={sortedWords}
          analytics={analytics}
          initialWordId={initialCardWordId}
          initialStudyGroup={initialCardStudyGroup}
          onEditWord={openEditWord}
          onReview={recordCardReview}
          onToggleFlag={toggleWordFlag}
          onOpenStudySetBuilder={openStudySetBuilder}
        />
      );
    }

    if (activeTab === 'quiz') {
      return (
        <QuizScreen
          words={words}
          analytics={analytics}
          progress={todayQuizProgress}
          priorityWordIds={quizPriorityWordIds}
          initialStudyGroup={initialQuizStudyGroup}
          timedLearningEnabled={timedLearningEnabled}
          timeBasedLearningSettings={timeBasedLearningSettings}
          quizPreferences={quizPreferences}
          refreshTokens={achievementWallet.refreshTokens}
          onUseRefreshToken={useAchievementRefreshToken}
          onComplete={completeQuiz}
          onToggleFlag={toggleWordFlag}
          onOpenStudySetBuilder={openStudySetBuilder}
          pausedSession={pausedQuizSession}
          onPauseSession={setPausedQuizSession}
          onDiscardPausedSession={() => setPausedQuizSession(null)}
          onRegisterPauseHandler={(handler) => {
            pauseActiveQuizRef.current = handler;
          }}
        />
      );
    }

    return (
      <DashboardScreen
        words={words}
        analytics={analytics}
        timedLearningEnabled={timedLearningEnabled}
        timeBasedLearningSettings={timeBasedLearningSettings}
        quizPreferences={quizPreferences}
        currentUser={currentUser}
        reminderSettings={reminderSettings}
        dailyQuizGoal={dailyQuizGoal}
        achievementPoints={achievementWallet.points}
        refreshTokens={achievementWallet.refreshTokens}
        onReviewDue={openDueReview}
        onStudyFlaggedCards={() => openCards(undefined, 'flagged')}
        onStudyFlaggedQuiz={openFlaggedQuiz}
        onSetWordFlagState={setWordFlagState}
        onToggleWordFocus={toggleWordFocus}
        onToggleWordReviewNext={toggleWordReviewNext}
        onUpdateReminder={updateReminder}
        onUpdateDailyQuizGoal={(goal) => setDailyQuizGoal(clampDailyQuizGoal(goal))}
        onTimedLearningChange={setTimedLearningEnabled}
        onTimeBasedLearningSettingsChange={setTimeBasedLearningSettings}
        onQuizPreferencesChange={setQuizPreferences}
        onOpenLegal={openLegalPage}
        onLogout={logout}
        onDeleteAccount={deleteAccount}
        onOpenOnboardingGuide={() => setShowOnboardingGuide(true)}
        onOpenPlus={() => presentPlusPaywall('premium-feature')}
      />
    );
  }

  if (!isReady) {
    return <WordWizLoadingScreen onLayout={hideNativeSplash} />;
  }

  if (!env.isSupabaseConfigured) {
    return (
      <SafeAreaView style={styles.loadingScreen} onLayout={hideNativeSplash}>
        <Ionicons name="warning-outline" size={34} color={COLORS.purpleDark} />
        <Text style={styles.loadingTitle}>WordWiz needs setup</Text>
        <Text style={styles.loadingText}>
          {env.configurationError ??
            'Add the Supabase production environment variables and rebuild the app.'}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} onLayout={hideNativeSplash}>
      <StatusBar style="dark" />
      <View style={styles.backgroundAura}>
        <View style={styles.backgroundBlobTop} />
        <View style={styles.backgroundBlobMiddle} />
        <View style={styles.backgroundBlobBottom} />
      </View>
      {!currentUser ? (
        <LoginScreen
          onLogin={login}
          onCreateAccount={createAccount}
          onForgotPassword={forgotPassword}
          onOAuthLogin={loginWithOAuth}
          onResendVerification={resendVerification}
        />
      ) : (
        <>
          {!hasCompletedOnboarding || showOnboardingGuide ? (
            <OnboardingScreen
              isReplay={showOnboardingGuide}
              onComplete={completeOnboarding}
            />
          ) : (
            <>
              {appNotice ? (
                <View style={styles.appNotice}>
                  <Ionicons
                    name="information-circle"
                    size={18}
                    color={COLORS.blue}
                  />
                  <Text style={styles.appNoticeText}>{appNotice}</Text>
                  <Pressable
                    onPress={() => setAppNotice(null)}
                    style={styles.appNoticeClose}
                  >
                    <Ionicons name="close" size={16} color={COLORS.muted} />
                  </Pressable>
                </View>
              ) : null}
              {isCloudLoading ? (
                <View style={styles.syncNotice}>
                  <Ionicons
                    name="cloud-download-outline"
                    size={17}
                    color={COLORS.purpleDark}
                  />
                  <Text style={styles.syncNoticeText}>
                    Syncing your words...
                  </Text>
                </View>
              ) : null}
              {renderScreen()}
              <BottomTabs
                activeTab={activeTab}
                bottomInset={insets.bottom}
                quizComplete={Boolean(todayQuizProgress)}
                onChange={(tab) => {
                  if (activeTab === 'quiz' && tab !== 'quiz') {
                    pauseActiveQuizRef.current?.();
                  }
                  if (tab !== 'cards') {
                    setInitialCardWordId(null);
                    setInitialCardStudyGroup(undefined);
                  }
                  if (tab !== 'quiz') {
                    setInitialQuizStudyGroup(undefined);
                  }
                  if (tab === 'quiz') {
                    openQuiz();
                    return;
                  }
                  setActiveTab(tab);
                }}
              />
            </>
          )}
        </>
      )}
      <AddWordModal
        visible={showAddWord}
        wordToEdit={wordToEdit}
        words={words}
        onEditExisting={setWordToEdit}
        onClose={closeWordModal}
        onAdd={addWord}
      />
      <DeleteWordModal
        word={wordToRemove}
        onClose={() => setWordToRemove(null)}
        onConfirm={() => {
          if (wordToRemove) {
            removeWord(wordToRemove);
          }
          setWordToRemove(null);
        }}
      />
      <WordWizPlusModal
        visible={showPlusPaywall}
        reason={plusPaywallReason}
        onClose={() => {
          pendingPlusAction.current = null;
          setShowPlusPaywall(false);
        }}
        onPlusActivated={() => {
          const action = pendingPlusAction.current;
          pendingPlusAction.current = null;

          // RevenueCat has already confirmed the purchase at this point. Open
          // the requested feature immediately instead of waiting for the
          // optional server-side entitlement mirror to finish.
          if (currentUser) {
            immediatelyActivatedPlusUserId.current = currentUser.id;
            setJustActivatedPlusUserId(currentUser.id);
          }
          void subscription.refreshAccess();
          setShowPlusPaywall(false);
          action?.();

          void syncRevenueCatEntitlement()
            .catch((error) => {
              reportError(error, { area: 'revenuecat_entitlement_sync' });
            });
        }}
        onOpenLegal={openLegalPage}
      />
      <ComplimentaryAccessModal
        visible={showComplimentaryWelcome}
        expiresAt={subscription.complimentaryExpiresAt}
        onClose={() => setShowComplimentaryWelcome(false)}
      />
    </SafeAreaView>
  );
}

function OnboardingScreen({
  onComplete,
  isReplay,
}: {
  onComplete: (enableReminder: boolean, isReplay?: boolean) => Promise<void>;
  isReplay: boolean;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(0);
  const pages = [
    {
      eyebrow: 'WELCOME TO WORDWIZ',
      icon: 'sparkles' as const,
      title: 'Make words stick',
      text: 'Save a word once, then let a few small reviews turn it into knowledge you can use.',
      steps: [
        ['add-circle-outline', 'Save what you meet', 'WordWiz builds a clear learning card with meaning, examples, and history.'],
        ['layers-outline', 'Keep it organized', 'Your words, collections, and focus tools stay together in one place.'],
      ],
    },
    {
      eyebrow: 'A LITTLE PRACTICE',
      icon: 'albums-outline' as const,
      title: 'Review, then recall',
      text: 'Short sessions work best when they ask your brain to bring the answer back.',
      steps: [
        ['copy-outline', 'Use cards first', 'Flip through flashcards whenever you want a quick refresher.'],
        ['trophy-outline', 'Take a fresh quiz', 'Daily quizzes and varied prompts help move words into long-term memory.'],
      ],
    },
    {
      eyebrow: 'MAKE PROGRESS VISIBLE',
      icon: 'trending-up-outline' as const,
      title: 'Build your word power',
      text: 'Stats show what is sticking, while achievements and reminders help you keep a relaxed rhythm.',
      steps: [
        ['bar-chart-outline', 'Watch mastery grow', 'See strong words, quiz accuracy, and the next best review.'],
        ['ticket-outline', 'Earn useful rewards', 'Achievements earn refreshes for an extra daily quiz or Omega Test.'],
      ],
    },
  ];
  const currentPage = pages[page];
  const isLastPage = page === pages.length - 1;

  async function finish(enableReminder: boolean) {
    setIsSaving(true);
    try {
      await onComplete(enableReminder, isReplay);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.onboardingScreen}>
      <View style={styles.onboardingTopRow}>
        <Text style={styles.onboardingPageLabel}>
          {isReplay ? 'HOW WORDWIZ WORKS' : `STEP ${page + 1} OF ${pages.length}`}
        </Text>
        {!isLastPage ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
            disabled={isSaving}
            onPress={() => finish(false)}
            style={({ pressed }) => [styles.onboardingSkipButton, pressed && styles.pressed]}
          >
            <Text style={styles.onboardingSkipText}>SKIP</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.onboardingHero}>
        <View style={styles.onboardingIcon}>
          <Ionicons name={currentPage.icon} size={34} color={COLORS.white} />
        </View>
        <Text style={styles.onboardingEyebrow}>{currentPage.eyebrow}</Text>
        <Text style={styles.onboardingTitle}>{currentPage.title}</Text>
        <Text style={styles.onboardingText}>
          {currentPage.text}
        </Text>
      </View>

      <View style={styles.onboardingSteps}>
        {currentPage.steps.map(([icon, title, text], index) => (
          <View key={title} style={styles.onboardingStep}>
            <View style={styles.onboardingStepMarker}>
              <Text style={styles.onboardingStepNumber}>{index + 1}</Text>
            </View>
            <View style={styles.onboardingStepIcon}>
              <Ionicons
                name={icon as keyof typeof Ionicons.glyphMap}
                size={20}
                color={COLORS.purpleDark}
              />
            </View>
            <View style={styles.onboardingStepCopy}>
              <Text style={styles.onboardingStepTitle}>{title}</Text>
              <Text style={styles.onboardingStepText}>{text}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.onboardingPageDots}>
        {pages.map((item, index) => (
          <View
            key={item.title}
            style={[
              styles.onboardingPageDot,
              index === page && styles.onboardingPageDotActive,
            ]}
          />
        ))}
      </View>
      <Pressable
        disabled={isSaving}
        onPress={() => {
          if (isLastPage) {
            void finish(false);
            return;
          }
          setPage((current) => current + 1);
        }}
        style={({ pressed }) => [
          styles.primaryButton,
          isSaving && styles.primaryButtonDisabled,
          pressed && !isSaving && styles.primaryButtonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {isLastPage ? (isReplay ? 'BACK TO WORDWIZ' : 'START LEARNING') : 'CONTINUE'}
        </Text>
        <Ionicons name="arrow-forward" size={21} color={COLORS.white} />
      </Pressable>
      {page > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setPage((current) => current - 1)}
          style={({ pressed }) => [styles.onboardingBackButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={17} color={COLORS.purpleDark} />
          <Text style={styles.onboardingBackText}>BACK</Text>
        </Pressable>
      ) : null}
      {isLastPage ? (
        <Pressable
          disabled={isSaving}
          onPress={() => finish(true)}
          style={({ pressed }) => [
            styles.onboardingReminderButton,
            pressed && !isSaving && styles.pressed,
          ]}
        >
          <Ionicons name="notifications-outline" size={18} color={COLORS.blue} />
          <Text style={styles.onboardingReminderText}>
            Start with a 7 PM reminder
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

async function clearLocalLearningData(userId: string) {
  await AsyncStorage.multiRemove([
    getUserCacheKey(userId, 'words'),
    getUserCacheKey(userId, 'quiz-progress'),
    getUserCacheKey(userId, 'analytics'),
    getUserCacheKey(userId, 'reminder-settings'),
    getUserCacheKey(userId, 'daily-quiz-goal'),
    getUserCacheKey(userId, 'timed-learning-enabled'),
    getUserCacheKey(userId, 'time-based-learning-settings'),
    getUserCacheKey(userId, 'quiz-preferences'),
    getUserCacheKey(userId, 'achievement-wallet'),
    getUserCacheKey(userId, 'cloud-hydrated-at'),
    getUserCacheKey(userId, 'onboarding-complete'),
  ]);
}

function getUserCacheKey(userId: string, key: string) {
  return `@wordwiz/users/${userId}/${key}`;
}

function clampDailyQuizGoal(goal: number) {
  return Math.max(1, Math.min(5, Math.round(goal)));
}

function logCloudSync(event: string, details: Record<string, number | string>) {
  if (!CLOUD_SYNC_LOGS_ENABLED) {
    return;
  }

  console.info('[WordWiz Supabase sync]', {
    event,
    ...details,
  });
}

function getScreenContext(screen: Tab, reason: string) {
  return {
    screen: getScreenName(screen),
    reason,
  };
}

function getScreenName(screen: Tab) {
  if (screen === 'home') return 'Home';
  if (screen === 'words') return 'Words';
  if (screen === 'cards') return 'Cards';
  if (screen === 'quiz') return 'Quiz';
  return 'Dashboard';
}

function isUserCreatedWord(word: Word) {
  return !isStarterWordId(word.id);
}

function isStarterWordId(wordId: string) {
  return STARTER_WORDS.some((starterWord) => starterWord.id === wordId);
}

function buildCurrentReminderContext(
  words: Word[],
  analytics: AnalyticsData,
  dailyQuizGoal: number,
) {
  const dayKey = getDayKey();
  const userWords = words.filter(isUserCreatedWord);
  const masteryScores = userWords.map((word) =>
    getWordMastery(word, analytics),
  );
  const overallMastery = masteryScores.length
    ? Math.round(
        masteryScores.reduce((total, score) => total + score, 0) /
          masteryScores.length,
      )
    : 0;
  const nextLevel = getNextMasteryLevel(overallMastery);
  const quizzesToday = analytics.quizHistory.filter(
    (attempt) => attempt.date === dayKey,
  ).length;
  const hasCardPracticeToday = analytics.cardHistory.some(
    (event) => event.date === dayKey,
  );
  const totalQuizQuestions = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.total,
    0,
  );
  const totalCorrect = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.score,
    0,
  );

  return {
    currentStreak: calculateStreakStats(analytics).current,
    hasPracticedToday: hasCardPracticeToday || quizzesToday > 0,
    dueReviewCount: getDueReviewWords(userWords, analytics).length,
    quizzesToday,
    dailyQuizGoal,
    totalQuizQuestions,
    overallAccuracy: totalQuizQuestions
      ? Math.round((totalCorrect / totalQuizQuestions) * 100)
      : null,
    unreviewedNewWordCount: userWords.filter((word) => word.reviews === 0)
      .length,
    pointsToNextLevel: nextLevel
      ? Math.max(0, nextLevel.minScore - overallMastery)
      : null,
    dayKey,
  };
}

async function clearLegacyLearningData() {
  await AsyncStorage.multiRemove([
    '@wordwiz/words',
    '@wordwiz/quiz-progress',
    '@wordwiz/analytics',
    '@wordwiz/reminder-settings',
  ]);
}

function WordWizLoadingScreen({ onLayout }: { onLayout: () => void }) {
  const float = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(float, {
            toValue: -7,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(float, {
            toValue: 0,
            duration: 1600,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(shimmer, {
            toValue: 1,
            duration: 1100,
            useNativeDriver: true,
          }),
          Animated.timing(shimmer, {
            toValue: 0.35,
            duration: 1100,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [float, shimmer]);

  return (
    <SafeAreaView style={styles.loadingScreen} onLayout={onLayout}>
      <View pointerEvents="none" style={styles.loadingAura}>
        <View style={styles.loadingAuraTop} />
        <View style={styles.loadingAuraBottom} />
      </View>

      <View style={styles.loadingContent}>
        <Animated.View
          style={[
            styles.loadingWizardBadge,
            { transform: [{ translateY: float }] },
          ]}
        >
          <View style={styles.loadingWizardHatCone} />
          <View style={styles.loadingWizardHatBrim} />
          <Animated.View style={[styles.loadingWizardSparkle, { opacity: shimmer }]}>
            <Ionicons name="sparkles" size={20} color="#FFE58A" />
          </Animated.View>
        </Animated.View>

        <Text style={styles.loadingEyebrow}>WORDWIZ</Text>
        <Text style={styles.loadingTitle}>Preparing your next{`\n`}word adventure</Text>
        <Text style={styles.loadingText}>
          “To learn ... is to light a fire; every syllable that is spelling out is a spark.”
        </Text>

        <View style={styles.loadingProgressTrack} accessibilityLabel="Loading WordWiz">
          <Animated.View style={[styles.loadingProgressGlow, { opacity: shimmer }]} />
        </View>
      </View>

      <Animated.View style={[styles.loadingMagicFooter, { opacity: shimmer }]}>
        <Ionicons name="sparkles" size={15} color={COLORS.purpleDark} />
        <Text style={styles.loadingMagicText}>A little magic for every new word</Text>
        <Ionicons name="star" size={11} color="#F4C866" />
      </Animated.View>
    </SafeAreaView>
  );
}

function createUuid() {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && 'randomUUID' in cryptoApi) {
    return cryptoApi.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
