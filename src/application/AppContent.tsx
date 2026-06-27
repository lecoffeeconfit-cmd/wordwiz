import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabs } from '../components';
import {
  DEFAULT_REMINDER,
  EMPTY_ANALYTICS,
  STARTER_WORDS,
} from '../constants/data';
import { COLORS } from '../constants/theme';
import { AddWordModal, LegalModal } from '../modals';
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
  deleteCloudWord,
  fetchUserLearningData,
  reportError,
  saveCloudCardReview,
  saveCloudQuizAttempt,
  saveCloudReminderSettings,
  saveCloudWord,
  saveCloudWordReviews,
  scheduleDailyReminder,
  seedUserLearningData,
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
  applyQuizReviews,
  buildQuizCompletion,
  buildWordFromInput,
  getDayKey,
  mergeWordLists,
  upsertSavedWord,
} from '../utils';

const ONBOARDING_KEY = '@wordwiz/onboarding-complete/v1';

export default function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [words, setWords] = useState<Word[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical');
  const [quizProgress, setQuizProgress] = useState<QuizProgress | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>(EMPTY_ANALYTICS);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings>(DEFAULT_REMINDER);
  const [isReady, setIsReady] = useState(false);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [showAddWord, setShowAddWord] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalPage | null>(null);
  const cloudHydratedUserId = useRef<string | null>(null);
  const cloudWarningShown = useRef(false);
  const latestWords = useRef<Word[]>([]);

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
          return;
        }

        const sessionResult = await supabase.auth.getSession();
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
        }
      } catch (error) {
        reportError(error, { area: 'app_boot' });
        setWords(STARTER_WORDS);
        setAnalytics(EMPTY_ANALYTICS);
        setReminderSettings(DEFAULT_REMINDER);
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
    if (!isReady) {
      return;
    }

    if (!currentUser) {
      setWords(STARTER_WORDS);
      setQuizProgress(null);
      setAnalytics(EMPTY_ANALYTICS);
      setReminderSettings(DEFAULT_REMINDER);
      return;
    }

    if (cloudHydratedUserId.current !== currentUser.id) {
      loadUserCache(currentUser.id);
    }
  }, [currentUser?.id, isReady]);

  async function loadUserCache(userId: string) {
    try {
      const [savedWords, savedQuiz, savedAnalytics, savedReminder] =
        await Promise.all([
          AsyncStorage.getItem(getUserCacheKey(userId, 'words')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'quiz-progress')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'analytics')),
          AsyncStorage.getItem(getUserCacheKey(userId, 'reminder-settings')),
        ]);

      setWords(savedWords ? JSON.parse(savedWords) : STARTER_WORDS);
      setQuizProgress(savedQuiz ? JSON.parse(savedQuiz) : null);
      setAnalytics(savedAnalytics ? JSON.parse(savedAnalytics) : EMPTY_ANALYTICS);
      setReminderSettings(
        savedReminder
          ? { ...DEFAULT_REMINDER, ...JSON.parse(savedReminder) }
          : DEFAULT_REMINDER,
      );
    } catch (error) {
      reportError(error, { area: 'load_user_cache' });
      setWords(STARTER_WORDS);
      setQuizProgress(null);
      setAnalytics(EMPTY_ANALYTICS);
      setReminderSettings(DEFAULT_REMINDER);
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

    const userId = currentUser.id;
    let isActive = true;

    async function hydrateCloudData() {
      try {
        setIsCloudLoading(true);
        setAppNotice(null);
        const cloudData = await fetchUserLearningData(userId);

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
          const seededWords = await seedUserLearningData({
            userId,
            words,
            analytics,
            reminderSettings,
          });

          if (isActive && seededWords.length > 0) {
            setWords(seededWords);
          }
        }

        cloudHydratedUserId.current = userId;
      } catch (error) {
        console.error('WordWiz cloud hydration failed:', error);
        reportError(error, { area: 'cloud_hydration' });
        trackEvent('cloud_sync_failed', { operation: 'hydrate' });
        setAppNotice('Cloud sync is unavailable right now. Your local learning data is still ready.');
        if (!cloudWarningShown.current) {
          cloudWarningShown.current = true;
          Alert.alert(
            'Cloud sync needs setup',
            `WordWiz is still working locally. Supabase said: ${getErrorMessage(error)}`,
          );
        }
      } finally {
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

    missingWords.forEach((word) => {
      saveCloudWord(userId, word).catch((error) => {
        console.error('WordWiz cloud backfill word save failed:', error);
        reportError(error, { area: 'backfill_word' });
        trackEvent('cloud_sync_failed', { operation: 'backfill_word' });
      });
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

  const sortedWords = useMemo(() => {
    return [...words].sort((first, second) => {
      if (sortMode === 'recent') {
        return second.createdAt.localeCompare(first.createdAt);
      }

      return first.term.localeCompare(second.term);
    });
  }, [sortMode, words]);

  const todayQuizProgress =
    quizProgress?.date === getDayKey() ? quizProgress : null;

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
      const user = await signInWithSupabase(cleanEmail, password);
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
      await resendSupabaseEmailVerification(email);
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
      await sendSupabasePasswordReset(email);
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
      const user = await signInWithOAuthProvider(provider);
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
      setActiveTab('home');
      return;
    }

    try {
      await signOutWithSupabase();
    } catch {
      Alert.alert('Could not log out', 'Please try again.');
    } finally {
      setCurrentUser(null);
      cloudHydratedUserId.current = null;
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
      await requestSupabaseAccountDeletion();
      try {
        await signOutWithSupabase();
      } catch {
        // The account is already deleted server-side, so the local session can be cleared by state reset below.
      }
      if (deletingUserId) {
        await clearLocalLearningData(deletingUserId);
      }
      cloudHydratedUserId.current = null;
      setCurrentUser(null);
      setWords(STARTER_WORDS);
      setQuizProgress(null);
      setAnalytics(EMPTY_ANALYTICS);
      setReminderSettings(DEFAULT_REMINDER);
      setActiveTab('home');
      Alert.alert(
        'Account deleted',
        'Your WordWiz account deletion request was completed.',
      );
    } catch {
      Alert.alert(
        'Delete account needs setup',
        'WordWiz is ready for account deletion, but the Supabase delete-account Edge Function must be deployed first. Your account was not deleted.',
      );
    }
  }

  async function addWord(
    term: string,
    definition: string,
    example: string,
    details: Partial<WordDetails> = {},
  ) {
    const cleanTerm = term.trim();
    const existingWord = words.find(
      (word) => word.term.toLowerCase() === cleanTerm.toLowerCase(),
    );
    const wordData = buildWordFromInput({
      existingWord,
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
        savedWord = await saveCloudWord(currentUser.id, wordData);
      } catch (error) {
        console.error('WordWiz cloud word save failed:', error);
        reportError(error, { area: 'save_word' });
        trackEvent('cloud_sync_failed', { operation: 'save_word' });
        showCloudSaveWarning();
      }
    }

    setWords((currentWords) => upsertSavedWord(currentWords, savedWord));
    trackEvent('word_saved', {
      updatedExisting: Boolean(existingWord),
      hasSimpleDefinition: Boolean(savedWord.simpleDefinition),
    });
    setShowAddWord(false);
    setActiveTab('words');
  }

  function removeWord(wordToRemove: Word) {
    setWords((currentWords) =>
      currentWords.filter((word) => word.id !== wordToRemove.id),
    );

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      deleteCloudWord(currentUser.id, wordToRemove.id).catch((error) => {
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
    const reviewedWord = words.find((word) => word.id === wordId);
    const event = {
      id: createUuid(),
      wordId,
      date: getDayKey(),
      studiedAt,
      remembered,
      durationSeconds,
    };

    setWords((currentWords) =>
      currentWords.map((word) =>
        word.id === wordId ? { ...word, reviews: word.reviews + 1 } : word,
      ),
    );
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
        saveCloudCardReview(currentUser.id, event),
        reviewedWord
          ? saveCloudWordReviews(
              currentUser.id,
              reviewedWord.id,
              reviewedWord.reviews + 1,
            )
          : Promise.resolve(),
      ]).catch((error) => {
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

    setQuizProgress(progress);
    setWords((currentWords) => applyQuizReviews(currentWords, answers));
    setAnalytics((currentAnalytics) => addQuizAttempt(currentAnalytics, attempt));
    trackEvent('quiz_completed', { score, total, durationSeconds });

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      const reviewUpdates = answers
        .map((answer) => words.find((word) => word.id === answer.wordId))
        .filter((word): word is Word => Boolean(word))
        .map((word) =>
          saveCloudWordReviews(currentUser.id, word.id, word.reviews + 1),
        );

      Promise.all([
        saveCloudQuizAttempt(currentUser.id, attempt),
        ...reviewUpdates,
      ]).catch((error) => {
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
        setReminderSettings({ ...nextSettings, notificationId: undefined });
        saveReminderToCloud({ ...nextSettings, notificationId: undefined });
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

      const scheduledSettings = await scheduleDailyReminder(nextSettings);
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
      saveCloudReminderSettings(currentUser.id, settings).catch((error) => {
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
    Alert.alert(
      'Saved locally',
      'WordWiz kept your change on this device, but cloud sync could not finish yet. Check that the Supabase schema has been run with RLS enabled.',
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
          onAddWord={() => setShowAddWord(true)}
          onStudy={() => setActiveTab('cards')}
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
          onAdd={() => setShowAddWord(true)}
          onRemove={removeWord}
          onStudy={() => setActiveTab('cards')}
        />
      );
    }

    if (activeTab === 'cards') {
      return <CardsScreen words={sortedWords} onReview={recordCardReview} />;
    }

    if (activeTab === 'quiz') {
      return (
        <QuizScreen
          words={words}
          progress={todayQuizProgress}
          onComplete={completeQuiz}
        />
      );
    }

    return (
      <DashboardScreen
        words={words}
        analytics={analytics}
        currentUser={currentUser}
        reminderSettings={reminderSettings}
        onUpdateReminder={updateReminder}
        onOpenLegal={setLegalPage}
        onLogout={logout}
        onDeleteAccount={deleteAccount}
      />
    );
  }

  if (!isReady) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <Ionicons name="sparkles" size={34} color={COLORS.purpleDark} />
        <Text style={styles.loadingTitle}>Getting WordWiz ready...</Text>
      </SafeAreaView>
    );
  }

  if (!env.isSupabaseConfigured) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
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
    <SafeAreaView style={styles.safeArea}>
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
                onChange={setActiveTab}
              />
            </>
          )}
        </>
      )}
      <AddWordModal
        visible={showAddWord}
        onClose={() => setShowAddWord(false)}
        onAdd={addWord}
      />
      <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />
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
          { icon: 'add-circle-outline', text: 'Add a word and its meaning.' },
          { icon: 'albums-outline', text: 'Review with quick flashcards.' },
          { icon: 'notifications-outline', text: 'Optionally get a daily review nudge.' },
        ].map((step) => (
          <View key={step.text} style={styles.onboardingStep}>
            <Ionicons
              name={step.icon as keyof typeof Ionicons.glyphMap}
              size={21}
              color={COLORS.blue}
            />
            <Text style={styles.onboardingStepText}>{step.text}</Text>
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
  ]);
}

function getUserCacheKey(userId: string, key: string) {
  return `@wordwiz/users/${userId}/${key}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'The cloud request failed. Check Data API access, grants, and RLS policies.';
}

function isUserCreatedWord(word: Word) {
  return !STARTER_WORDS.some((starterWord) => starterWord.id === word.id);
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
