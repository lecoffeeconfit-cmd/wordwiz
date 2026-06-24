import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabs } from '../components';
import {
  ANALYTICS_KEY,
  DEFAULT_REMINDER,
  EMPTY_ANALYTICS,
  QUIZ_KEY,
  REMINDER_KEY,
  STARTER_WORDS,
  WORDS_KEY,
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
  saveCloudCardReview,
  saveCloudQuizAttempt,
  saveCloudReminderSettings,
  saveCloudWord,
  saveCloudWordReviews,
  scheduleDailyReminder,
  seedUserLearningData,
} from '../services';
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
import { getDayKey } from '../utils';

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
  const [showAddWord, setShowAddWord] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalPage | null>(null);
  const cloudHydratedUserId = useRef<string | null>(null);
  const cloudWarningShown = useRef(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [savedWords, savedQuiz, savedAnalytics, savedReminder, sessionResult] =
          await Promise.all([
            AsyncStorage.getItem(WORDS_KEY),
            AsyncStorage.getItem(QUIZ_KEY),
            AsyncStorage.getItem(ANALYTICS_KEY),
            AsyncStorage.getItem(REMINDER_KEY),
            supabase.auth.getSession(),
          ]);

        setCurrentUser(
          sessionResult.data.session?.user
            ? toAuthUser(sessionResult.data.session.user)
            : null,
        );
        setWords(savedWords ? JSON.parse(savedWords) : STARTER_WORDS);
        setQuizProgress(savedQuiz ? JSON.parse(savedQuiz) : null);
        setAnalytics(savedAnalytics ? JSON.parse(savedAnalytics) : EMPTY_ANALYTICS);
        setReminderSettings(
          savedReminder
            ? { ...DEFAULT_REMINDER, ...JSON.parse(savedReminder) }
            : DEFAULT_REMINDER,
        );
      } catch {
        setWords(STARTER_WORDS);
        setAnalytics(EMPTY_ANALYTICS);
        setReminderSettings(DEFAULT_REMINDER);
      } finally {
        setIsReady(true);
      }
    }

    loadData();

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
    if (!isReady || !currentUser) {
      return;
    }

    if (cloudHydratedUserId.current === currentUser.id) {
      return;
    }

    const userId = currentUser.id;
    let isActive = true;

    async function hydrateCloudData() {
      try {
        const cloudData = await fetchUserLearningData(userId);

        if (!isActive) {
          return;
        }

        if (cloudData.words.length > 0) {
          setWords(cloudData.words);
          setQuizProgress(cloudData.quizProgress);
          setAnalytics(cloudData.analytics);
          if (cloudData.reminderSettings) {
            setReminderSettings((currentSettings) => ({
              ...currentSettings,
              ...cloudData.reminderSettings,
            }));
          }
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
      } catch {
        if (!cloudWarningShown.current) {
          cloudWarningShown.current = true;
          Alert.alert(
            'Cloud sync needs setup',
            'WordWiz is still working locally. To enable production cloud data, run supabase/wordwiz_schema.sql in Supabase so the words, quiz, review, and reminder tables exist with RLS.',
          );
        }
      }
    }

    hydrateCloudData();

    return () => {
      isActive = false;
    };
  }, [currentUser?.id, isReady]);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(WORDS_KEY, JSON.stringify(words));
    }
  }, [isReady, words]);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(QUIZ_KEY, JSON.stringify(quizProgress));
    }
  }, [isReady, quizProgress]);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
    }
  }, [analytics, isReady]);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(REMINDER_KEY, JSON.stringify(reminderSettings));
    }
  }, [isReady, reminderSettings]);

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
      const user = await signUpWithSupabase({
        name,
        email: cleanEmail,
        password,
      });

      if (user) {
        setCurrentUser(user);
      } else {
        Alert.alert(
          'Check your email',
          'Your account was created. Confirm your email before logging in.',
        );
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

  async function forgotPassword(email: string) {
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
    const wordData: Word = {
      id: existingWord?.id ?? createUuid(),
      term: cleanTerm,
      definition: definition.trim(),
      simpleDefinition: details.simpleDefinition?.trim(),
      example: example.trim(),
      partOfSpeech: details.partOfSpeech?.trim(),
      pronunciation: details.pronunciation?.trim(),
      origin: details.origin?.trim(),
      originPeriod: details.originPeriod?.trim(),
      synonyms: details.synonyms ?? [],
      commonWords: details.commonWords ?? [],
      basicInfo: details.basicInfo?.trim(),
      createdAt: existingWord?.createdAt ?? new Date().toISOString(),
      reviews: existingWord?.reviews ?? 0,
    };
    let savedWord = wordData;

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      try {
        savedWord = await saveCloudWord(currentUser.id, wordData);
      } catch {
        showCloudSaveWarning();
      }
    }

    setWords((currentWords) =>
      existingWord
        ? currentWords.map((word) =>
            word.id === existingWord.id ? savedWord : word,
          )
        : [savedWord, ...currentWords],
    );
    setShowAddWord(false);
    setActiveTab('words');
  }

  function removeWord(wordToRemove: Word) {
    setWords((currentWords) =>
      currentWords.filter((word) => word.id !== wordToRemove.id),
    );

    if (currentUser && cloudHydratedUserId.current === currentUser.id) {
      deleteCloudWord(currentUser.id, wordToRemove.id).catch(() => {
        showCloudSaveWarning();
      });
    }
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
      ]).catch(() => {
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
    const progress: QuizProgress = {
      date: getDayKey(),
      score,
      total,
    };
    const attempt: QuizAttempt = {
      ...progress,
      id: createUuid(),
      completedAt: new Date().toISOString(),
      durationSeconds,
      answers,
    };

    setQuizProgress(progress);
    setWords((currentWords) =>
      currentWords.map((word) => {
        const answer = answers.find((item) => item.wordId === word.id);
        return answer ? { ...word, reviews: word.reviews + 1 } : word;
      }),
    );
    setAnalytics((currentAnalytics) => ({
      ...currentAnalytics,
      quizHistory: [attempt, ...currentAnalytics.quizHistory].slice(0, 30),
    }));

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
      ]).catch(() => {
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
        return;
      }

      if (Platform.OS === 'web') {
        setReminderSettings(nextSettings);
        saveReminderToCloud(nextSettings);
        Alert.alert(
          'Reminder saved',
          'Daily device notifications are available on iOS and Android.',
        );
        return;
      }

      const scheduledSettings = await scheduleDailyReminder(nextSettings);
      setReminderSettings(scheduledSettings);
      saveReminderToCloud(scheduledSettings);
    } catch {
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
      saveCloudReminderSettings(currentUser.id, settings).catch(() => {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.backgroundAura} pointerEvents="none">
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
        />
      ) : (
        <>
      {renderScreen()}
      <BottomTabs
        activeTab={activeTab}
        bottomInset={insets.bottom}
        quizComplete={Boolean(todayQuizProgress)}
        onChange={setActiveTab}
      />
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
