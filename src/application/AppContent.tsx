import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabs } from '../components';
import {
  DEFAULT_REMINDER,
  EMPTY_ANALYTICS,
  STARTER_WORDS,
} from '../constants/data';
import { COLORS } from '../constants/theme';
import { AddWordModal } from '../modals';
import {
  CardsScreen,
  DashboardScreen,
  HomeScreen,
  LoginScreen,
  QuizScreen,
  WordsScreen,
} from '../screens';
import {
  normalizeEmail,
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
  fetchUserLearningData,
  reportError,
  saveCloudCardReview,
  saveCloudQuizAttempt,
  saveCloudReminderSettings,
  saveCloudWord,
  saveCloudWords,
  scheduleDailyReminder,
  setSentryUser,
  trackEvent,
} from '../services';
import { env } from '../config/env';
import { styles } from '../styles';
import type {
  AnalyticsData,
  AuthUser,
  LegalPage,
  QuizAnswer,
  QuizAttempt,
  QuizProgress,
  ReminderSettings,
  SortMode,
  Tab,
  Word,
  WordDetails,
} from '../types';
import type { Provider } from '@supabase/supabase-js';
import {
  addQuizAttempt,
  applyFlashcardReview,
  applyQuizMastery,
  buildQuizCompletion,
  buildWordFromInput,
  calculateStreakStats,
  getDayKey,
  getNextMasteryLevel,
  getWordMastery,
  mergeWordLists,
  upsertSavedWord,
} from '../utils';

const ONBOARDING_KEY = '@wordwiz/onboarding-complete/v1';
const CLOUD_HYDRATE_CACHE_MS = 30 * 60 * 1000;
const LEGAL_PAGE_URLS: Record<LegalPage, string> = {
  privacy: 'https://lecoffeeconfit-cmd.github.io/wordwiz-legal/',
  terms: 'https://lecoffeeconfit-cmd.github.io/wordwiz-legal/terms.html',
};
const CLOUD_SYNC_LOGS_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_WORDWIZ_EGRESS_LOGS === 'true';

export default function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [words, setWords] = useState<Word[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical');
  const [initialCardWordId, setInitialCardWordId] = useState<string | null>(null);
  const [quizProgress, setQuizProgress] = useState<QuizProgress | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>(EMPTY_ANALYTICS);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings>(DEFAULT_REMINDER);
  const [dailyQuizGoal, setDailyQuizGoal] = useState(1);
  const [isReady, setIsReady] = useState(false);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [currentDayKey, setCurrentDayKey] = useState(getDayKey());
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [showAddWord, setShowAddWord] = useState(false);
  const [wordToEdit, setWordToEdit] = useState<Word | null>(null);
  const cloudHydratedUserId = useRef<string | null>(null);
  const cloudHydratingUserId = useRef<string | null>(null);
  const cloudWarningShown = useRef(false);
  const latestWords = useRef<Word[]>([]);
  const hasHiddenNativeSplash = useRef(false);
  const lastReminderRefreshKey = useRef<string | null>(null);
  const smartReminderContext = useMemo(
    () => buildCurrentReminderContext(words, analytics, dailyQuizGoal),
    [analytics, currentDayKey, dailyQuizGoal, words],
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
        const onboardingComplete = await AsyncStorage.getItem(ONBOARDING_KEY);
        setHasCompletedOnboarding(onboardingComplete === 'true');

        if (!env.isSupabaseConfigured) {
          setWords(STARTER_WORDS);
          setQuizProgress(null);
          setAnalytics(EMPTY_ANALYTICS);
          setReminderSettings(DEFAULT_REMINDER);
          setDailyQuizGoal(1);
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
          setWords(STARTER_WORDS);
          setQuizProgress(null);
          setAnalytics(EMPTY_ANALYTICS);
          setReminderSettings(DEFAULT_REMINDER);
          setDailyQuizGoal(1);
        }
      } catch (error) {
        reportError(error, { area: 'app_boot' });
        setWords(STARTER_WORDS);
        setAnalytics(EMPTY_ANALYTICS);
        setReminderSettings(DEFAULT_REMINDER);
        setDailyQuizGoal(1);
        setAppNotice('WordWiz had trouble loading saved data, so it opened with starter words.');
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
    setSentryUser(currentUser);
  }, [currentUser]);

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
      setWords(STARTER_WORDS);
      setQuizProgress(null);
      setAnalytics(EMPTY_ANALYTICS);
      setReminderSettings(DEFAULT_REMINDER);
      setDailyQuizGoal(1);
      return;
    }

    if (cloudHydratedUserId.current !== currentUser.id) {
      loadUserCache(currentUser.id);
    }
  }, [currentUser?.id, isReady]);

  async function loadUserCache(userId: string) {
    try {
      const [savedWords, savedQuiz, savedAnalytics, savedReminder, savedDailyQuizGoal] =
        await Promise.all([
          AsyncStorage.getItem(getUserCacheKey(userId, 'words')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'quiz-progress')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'analytics')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'reminder-settings')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'daily-quiz-goal')),
        ]);

      setWords(savedWords ? JSON.parse(savedWords) : STARTER_WORDS);
      setQuizProgress(savedQuiz ? JSON.parse(savedQuiz) : null);
      setAnalytics(savedAnalytics ? JSON.parse(savedAnalytics) : EMPTY_ANALYTICS);
      setReminderSettings(
        savedReminder
          ? { ...DEFAULT_REMINDER, ...JSON.parse(savedReminder) }
          : DEFAULT_REMINDER,
      );
      setDailyQuizGoal(clampDailyQuizGoal(Number(savedDailyQuizGoal) || 1));
    } catch (error) {
      reportError(error, { area: 'load_user_cache' });
      setWords(STARTER_WORDS);
      setQuizProgress(null);
      setAnalytics(EMPTY_ANALYTICS);
      setReminderSettings(DEFAULT_REMINDER);
      setDailyQuizGoal(1);
      setAppNotice('Saved data on this device could not be read. You can keep learning with starter words.');
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
          setWords((currentWords) =>
            currentWords.length > 0 ? currentWords : STARTER_WORDS,
          );
        }

        cloudHydratedUserId.current = userId;
        markCloudCacheFresh(userId);
      } catch (error) {
        console.error('WordWiz cloud hydration failed:', error);
        reportError(error, { area: 'cloud_hydration' });
        trackEvent('cloud_sync_failed', { operation: 'hydrate' });
        setAppNotice('Cloud sync is unavailable right now. Your local learning data is still ready.');
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
      console.error('WordWiz cloud backfill word save failed:', error);
      reportError(error, { area: 'backfill_word' });
      trackEvent('cloud_sync_failed', { operation: 'backfill_word' });
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

  async function completeOnboarding(enableReminder: boolean) {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    setHasCompletedOnboarding(true);
    trackEvent('onboarding_completed', {
      enabledReminder: enableReminder,
    });

    if (enableReminder) {
      await updateReminder({ ...reminderSettings, enabled: true });
    }
  }

  function openCards(wordId?: string) {
    setInitialCardWordId(wordId ?? null);
    setActiveTab('cards');
  }

  function openAddWord() {
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

      if (result.needsEmailVerification) {
        Alert.alert(
          'Check your email',
          'We sent you a verification link. Confirm your email, then log in to WordWiz.',
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
      setWords(STARTER_WORDS);
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
  ) {
    const cleanTerm = term.trim();
    const isReplacingStarterWord = STARTER_WORDS.some(
      (starterWord) =>
        starterWord.term.toLowerCase() === cleanTerm.toLowerCase(),
    );
    const existingWord = words.find(
      (word) => word.term.toLowerCase() === cleanTerm.toLowerCase(),
    );
    if (existingWord && wordToEdit?.id !== existingWord.id) {
      return;
    }
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

    if (currentUser) {
      try {
        savedWord = await saveCloudWord(
          currentUser.id,
          wordData,
          getScreenContext(activeTab, 'add_word'),
        );
        markCloudCacheFresh(currentUser.id);
      } catch (error) {
        console.error('WordWiz cloud word save failed:', error);
        reportError(error, { area: 'save_word' });
        trackEvent('cloud_sync_failed', { operation: 'save_word' });
        showCloudSaveWarning();
      }
    }

    setWords((currentWords) => upsertSavedWord(currentWords, savedWord));
    trackEvent('word_saved', {
      updatedExisting: Boolean(existingWord && !isReplacingStarterWord),
      hasSimpleDefinition: Boolean(savedWord.simpleDefinition),
    });
    if (options.closeAfterSave !== false) {
      setShowAddWord(false);
      setWordToEdit(null);
      setActiveTab('words');
    }
  }

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
          console.error('WordWiz cloud word delete failed:', error);
          reportError(error, { area: 'delete_word' });
          trackEvent('cloud_sync_failed', { operation: 'delete_word' });
          showCloudSaveWarning();
        });
    }
    trackEvent('word_deleted');
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
          console.error('WordWiz cloud card review save failed:', error);
          reportError(error, { area: 'save_card_review' });
          trackEvent('cloud_sync_failed', { operation: 'save_card_review' });
          showCloudSaveWarning();
        });
    }
  }

  async function completeQuiz(
    score: number,
    total: number,
    durationSeconds: number,
    answers: QuizAnswer[],
  ) {
    const { progress, attempt } = buildQuizCompletion({
      score,
      total,
      durationSeconds,
      answers,
      id: createUuid(),
      completedAt: new Date().toISOString(),
    });

    setQuizProgress((currentProgress) =>
      currentProgress?.date === progress.date ? currentProgress : progress,
    );
    const updatedWords = applyQuizMastery(words, answers, analytics);
    setWords(updatedWords);
    setAnalytics((currentAnalytics) => addQuizAttempt(currentAnalytics, attempt));
    trackEvent('quiz_completed', { score, total, durationSeconds });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      const reviewUpdates = answers
        .map((answer) => updatedWords.find((word) => word.id === answer.wordId))
        .filter(
          (word): word is Word =>
            word !== undefined && !isStarterWordId(word.id),
        )
        .map((word) =>
          saveCloudWord(
            currentUser.id,
            word,
            getScreenContext('quiz', 'update_quiz_mastery'),
          ),
        );

      Promise.all([
        saveCloudQuizAttempt(
          currentUser.id,
          attempt,
          getScreenContext('quiz', 'complete_quiz'),
        ),
        ...reviewUpdates,
      ])
        .then(() => {
          markCloudCacheFresh(currentUser.id);
        })
        .catch((error) => {
          console.error('WordWiz cloud quiz save failed:', error);
          reportError(error, { area: 'save_quiz' });
          trackEvent('cloud_sync_failed', { operation: 'save_quiz' });
          showCloudSaveWarning();
        });
    }
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
          console.error('WordWiz cloud reminder save failed:', error);
          reportError(error, { area: 'save_reminder_settings' });
          trackEvent('cloud_sync_failed', { operation: 'save_reminder' });
          showCloudSaveWarning();
        });
    }
  }

  function showCloudSaveWarning() {
    if (cloudWarningShown.current) {
      return;
    }

    cloudWarningShown.current = true;
    setAppNotice(
      'Saved on this device. Cloud sync is temporarily unavailable and will try again later.',
    );
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
          onQuiz={() => setActiveTab('quiz')}
          onStats={() => setActiveTab('dashboard')}
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
          onRemove={removeWord}
          onStudy={() => openCards()}
          onSelectWord={(word) => openCards(word.id)}
        />
      );
    }

    if (activeTab === 'cards') {
      return (
        <CardsScreen
          words={sortedWords}
          analytics={analytics}
          initialWordId={initialCardWordId}
          onEditWord={openEditWord}
          onReview={recordCardReview}
        />
      );
    }

    if (activeTab === 'quiz') {
      return (
        <QuizScreen
          words={words}
          analytics={analytics}
          progress={todayQuizProgress}
          onComplete={completeQuiz}
          onReviewCards={() => openCards()}
        />
      );
    }

    return (
      <DashboardScreen
        words={words}
        analytics={analytics}
        currentUser={currentUser}
        reminderSettings={reminderSettings}
        dailyQuizGoal={dailyQuizGoal}
        onUpdateReminder={updateReminder}
        onUpdateDailyQuizGoal={(goal) => setDailyQuizGoal(clampDailyQuizGoal(goal))}
        onOpenLegal={openLegalPage}
        onLogout={logout}
        onDeleteAccount={deleteAccount}
      />
    );
  }

  if (!isReady) {
    return (
      <SafeAreaView style={styles.loadingScreen} onLayout={hideNativeSplash}>
        <Ionicons name="sparkles" size={34} color={COLORS.purpleDark} />
        <Text style={styles.loadingTitle}>Getting WordWiz ready...</Text>
      </SafeAreaView>
    );
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
          {!hasCompletedOnboarding ? (
            <OnboardingScreen onComplete={completeOnboarding} />
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
                  if (tab !== 'cards') {
                    setInitialCardWordId(null);
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
    </SafeAreaView>
  );
}

function OnboardingScreen({
  onComplete,
}: {
  onComplete: (enableReminder: boolean) => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);

  async function finish(enableReminder: boolean) {
    setIsSaving(true);
    try {
      await onComplete(enableReminder);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View style={styles.onboardingScreen}>
      <View style={styles.onboardingHero}>
        <View style={styles.onboardingIcon}>
          <Ionicons name="sparkles" size={34} color={COLORS.white} />
        </View>
        <Text style={styles.onboardingTitle}>Make words stick</Text>
        <Text style={styles.onboardingText}>
          Save words you meet, practice them as cards, and take one short quiz each day.
        </Text>
      </View>

      <View style={styles.onboardingSteps}>
        {[
          {
            icon: 'add-circle-outline',
            title: 'Save a word',
            text: 'Type it once and WordWiz fills in meaning, examples, and history.',
          },
          {
            icon: 'albums-outline',
            title: 'Review it quickly',
            text: 'Flashcards and quizzes help move new words into memory.',
          },
          {
            icon: 'notifications-outline',
            title: 'Come back tomorrow',
            text: 'A gentle reminder is optional and can be changed anytime.',
          },
        ].map((step, index) => (
          <View key={step.title} style={styles.onboardingStep}>
            <View style={styles.onboardingStepMarker}>
              <Text style={styles.onboardingStepNumber}>{index + 1}</Text>
            </View>
            <View style={styles.onboardingStepIcon}>
              <Ionicons
                name={step.icon as keyof typeof Ionicons.glyphMap}
                size={20}
                color={COLORS.purpleDark}
              />
            </View>
            <View style={styles.onboardingStepCopy}>
              <Text style={styles.onboardingStepTitle}>{step.title}</Text>
              <Text style={styles.onboardingStepText}>{step.text}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        disabled={isSaving}
        onPress={() => finish(false)}
        style={({ pressed }) => [
          styles.primaryButton,
          isSaving && styles.primaryButtonDisabled,
          pressed && !isSaving && styles.primaryButtonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>START LEARNING</Text>
        <Ionicons name="arrow-forward" size={21} color={COLORS.white} />
      </Pressable>
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
    getUserCacheKey(userId, 'cloud-hydrated-at'),
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

  return {
    currentStreak: calculateStreakStats(analytics).current,
    hasPracticedToday: hasCardPracticeToday || quizzesToday > 0,
    dueReviewCount: userWords.filter(
      (word) => word.reviews > 0 && getWordMastery(word, analytics) < 80,
    ).length,
    quizzesToday,
    dailyQuizGoal,
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
