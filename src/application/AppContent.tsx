import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabs } from '../components';
import {
  ANALYTICS_KEY,
  AUTH_SESSION_KEY,
  AUTH_USERS_KEY,
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
  createStoredUser,
  normalizeEmail,
  scrubStoredUsers,
  toSafeUser,
  validateEmail,
  validateName,
  validatePassword,
  verifyStoredPassword,
  cancelReminder,
  scheduleDailyReminder,
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
  StoredUser,
  Tab,
  Word,
  WordDetails,
} from '../types';
import { getDayKey } from '../utils';

export default function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [words, setWords] = useState<Word[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical');
  const [quizProgress, setQuizProgress] = useState<QuizProgress | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData>(EMPTY_ANALYTICS);
  const [authUsers, setAuthUsers] = useState<StoredUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings>(DEFAULT_REMINDER);
  const [isReady, setIsReady] = useState(false);
  const [showAddWord, setShowAddWord] = useState(false);
  const [legalPage, setLegalPage] = useState<LegalPage | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [
          savedWords,
          savedQuiz,
          savedAnalytics,
          savedReminder,
          savedUsers,
          savedSession,
        ] =
          await Promise.all([
            AsyncStorage.getItem(WORDS_KEY),
            AsyncStorage.getItem(QUIZ_KEY),
            AsyncStorage.getItem(ANALYTICS_KEY),
            AsyncStorage.getItem(REMINDER_KEY),
            AsyncStorage.getItem(AUTH_USERS_KEY),
            AsyncStorage.getItem(AUTH_SESSION_KEY),
          ]);

        const parsedUsers: StoredUser[] = savedUsers
          ? JSON.parse(savedUsers)
          : [];
        const parsedSession: AuthUser | null = savedSession
          ? JSON.parse(savedSession)
          : null;

        setAuthUsers(scrubStoredUsers(parsedUsers));
        setCurrentUser(
          parsedSession &&
            parsedUsers.some((user) => user.id === parsedSession.id)
            ? parsedSession
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
  }, []);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(AUTH_USERS_KEY, JSON.stringify(authUsers));
    }
  }, [authUsers, isReady]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (currentUser) {
      AsyncStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(currentUser));
    } else {
      AsyncStorage.removeItem(AUTH_SESSION_KEY);
    }
  }, [currentUser, isReady]);

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
    const user = authUsers.find((item) => item.email === cleanEmail);

    if (!user) {
      Alert.alert(
        'Could not log in',
        'Check your email and password.',
      );
      return false;
    }

    const result = await verifyStoredPassword(user, password);

    if (!result.valid) {
      Alert.alert(
        'Could not log in',
        'Check your email and password.',
      );
      return false;
    }

    const migratedUser = result.migratedUser;
    if (migratedUser) {
      setAuthUsers((currentUsers) =>
        scrubStoredUsers(
          currentUsers.map((item) =>
            item.id === migratedUser.id ? migratedUser : item,
          ),
        ),
      );
      setCurrentUser(toSafeUser(migratedUser));
      return true;
    }

    setCurrentUser(toSafeUser(user));
    return true;
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

    if (
      authUsers.some((user) => user.email.toLowerCase() === cleanEmail)
    ) {
      Alert.alert(
        'Could not create account',
        'Try logging in or use a different email.',
      );
      return false;
    }

    const newUser = await createStoredUser({
      name,
      email: cleanEmail,
      password,
    });

    setAuthUsers((currentUsers) => [newUser, ...currentUsers]);
    setCurrentUser(toSafeUser(newUser));
    return true;
  }

  function forgotPassword(email: string) {
    Alert.alert(
      'Reset help',
      'If a local WordWiz account exists for that email, use the password saved on this device or create a new local profile. Production reset emails need a backend auth service.',
    );
  }

  function logout() {
    setCurrentUser(null);
    setActiveTab('home');
  }

  function addWord(
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
      id: existingWord?.id ?? `${Date.now()}`,
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

    setWords((currentWords) =>
      existingWord
        ? currentWords.map((word) => (word.id === existingWord.id ? wordData : word))
        : [wordData, ...currentWords],
    );
    setShowAddWord(false);
    setActiveTab('words');
  }

  function removeWord(wordToRemove: Word) {
    setWords((currentWords) =>
      currentWords.filter((word) => word.id !== wordToRemove.id),
    );
  }

  function recordCardReview(
    wordId: string,
    remembered: boolean,
    durationSeconds: number,
  ) {
    const studiedAt = new Date().toISOString();

    setWords((currentWords) =>
      currentWords.map((word) =>
        word.id === wordId ? { ...word, reviews: word.reviews + 1 } : word,
      ),
    );
    setAnalytics((currentAnalytics) => ({
      ...currentAnalytics,
      cardHistory: [
        {
          id: `${Date.now()}`,
          wordId,
          date: getDayKey(),
          studiedAt,
          remembered,
          durationSeconds,
        },
        ...currentAnalytics.cardHistory,
      ].slice(0, 80),
    }));
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
      id: `${Date.now()}`,
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
  }

  async function updateReminder(nextSettings: ReminderSettings) {
    try {
      if (!nextSettings.enabled) {
        await cancelReminder(reminderSettings);
        setReminderSettings({ ...nextSettings, notificationId: undefined });
        return;
      }

      if (Platform.OS === 'web') {
        setReminderSettings(nextSettings);
        Alert.alert(
          'Reminder saved',
          'Daily device notifications are available on iOS and Android.',
        );
        return;
      }

      const scheduledSettings = await scheduleDailyReminder(nextSettings);
      setReminderSettings(scheduledSettings);
    } catch {
      setReminderSettings(nextSettings);
      Alert.alert(
        'Reminder saved',
        'WordWiz saved the time, but could not schedule a device notification yet.',
      );
    }
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
