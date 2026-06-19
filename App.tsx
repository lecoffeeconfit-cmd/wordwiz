import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import type * as ExpoNotifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

type Tab = 'home' | 'words' | 'cards' | 'quiz' | 'dashboard';
type SortMode = 'alphabetical' | 'recent';

type Word = {
  id: string;
  term: string;
  definition: string;
  simpleDefinition?: string;
  example: string;
  partOfSpeech?: string;
  pronunciation?: string;
  origin?: string;
  originPeriod?: string;
  synonyms?: string[];
  commonWords?: string[];
  basicInfo?: string;
  createdAt: string;
  reviews: number;
};

type WordDetails = Pick<
  Word,
  | 'definition'
  | 'simpleDefinition'
  | 'example'
  | 'partOfSpeech'
  | 'pronunciation'
  | 'origin'
  | 'originPeriod'
  | 'synonyms'
  | 'commonWords'
  | 'basicInfo'
>;

type DictionaryDefinition = {
  definition?: string;
  example?: string;
  synonyms?: string[];
};

type DictionaryMeaning = {
  partOfSpeech?: string;
  definitions?: DictionaryDefinition[];
  synonyms?: string[];
};

type DictionaryEntry = {
  word?: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  origin?: string;
  meanings?: DictionaryMeaning[];
};

type QuizProgress = {
  date: string;
  score: number;
  total: number;
};

type QuizAnswer = {
  wordId: string;
  correct: boolean;
};

type QuizAttempt = QuizProgress & {
  id: string;
  completedAt: string;
  durationSeconds: number;
  answers: QuizAnswer[];
};

type CardStudyEvent = {
  id: string;
  wordId: string;
  date: string;
  studiedAt: string;
  remembered: boolean;
  durationSeconds: number;
};

type AnalyticsData = {
  quizHistory: QuizAttempt[];
  cardHistory: CardStudyEvent[];
};

type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  notificationId?: string;
};

type StreakStats = {
  current: number;
  longest: number;
  todayDone: boolean;
  activeDates: Set<string>;
};

type QuizQuestion = {
  word: Word;
  options: string[];
  answer: string;
};

const COLORS = {
  ink: '#1F2747',
  muted: '#7A83A5',
  green: '#8DE7C7',
  greenDark: '#2AA987',
  greenPale: '#EFFFF8',
  blue: '#2879E8',
  bluePale: '#EAF2FF',
  yellow: '#FFD87A',
  yellowPale: '#FFF7DF',
  red: '#FF7E9F',
  redPale: '#FFF0F5',
  purple: '#8E78FF',
  purpleDark: '#5B4DE4',
  purplePale: '#F2EFFF',
  teal: '#39C69A',
  tealPale: '#E8FBF4',
  orange: '#F2A65A',
  orangePale: '#FFF0DC',
  pink: '#FF7FA8',
  pinkPale: '#FFEAF1',
  peach: '#FFD8C7',
  blush: '#FFEAF1',
  lavender: '#E7E0FF',
  sky: '#DCEBFF',
  background: '#F8F4FF',
  surface: '#FFFBFF',
  border: '#E9E4F5',
  white: '#FFFFFF',
};

const SOFT_SHADOW = {
  boxShadow: '0 14px 34px rgba(92, 86, 148, 0.13)',
  elevation: 5,
};

const FLOATING_SHADOW = {
  boxShadow: '0 18px 42px rgba(80, 91, 184, 0.18)',
  elevation: 7,
};

const TILE_COLORS = [
  { accent: COLORS.purple, pale: COLORS.purplePale },
  { accent: COLORS.orange, pale: COLORS.orangePale },
  { accent: COLORS.blue, pale: COLORS.bluePale },
  { accent: COLORS.red, pale: COLORS.redPale },
  { accent: COLORS.teal, pale: COLORS.tealPale },
  { accent: COLORS.yellow, pale: COLORS.yellowPale },
];

const WORDS_KEY = '@wordwiz/words';
const QUIZ_KEY = '@wordwiz/quiz-progress';
const ANALYTICS_KEY = '@wordwiz/analytics';
const REMINDER_KEY = '@wordwiz/reminder-settings';
const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  hour: 19,
  minute: 0,
};
const EMPTY_ANALYTICS: AnalyticsData = {
  quizHistory: [],
  cardHistory: [],
};

let notificationsModule: typeof ExpoNotifications | null = null;
let notificationsConfigured = false;

async function getNotificationsModule() {
  if (Platform.OS === 'web') {
    throw new Error('Daily reminders are available on iOS and Android.');
  }

  notificationsModule ??= await import('expo-notifications');
  if (!notificationsConfigured) {
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationsConfigured = true;
  }

  return notificationsModule;
}

const STARTER_WORDS: Word[] = [
  {
    id: 'starter-1',
    term: 'Curious',
    definition: 'Eager to know or learn something.',
    simpleDefinition: 'Wanting to learn or ask questions.',
    example: 'Maya was curious about how the tiny seed became a flower.',
    partOfSpeech: 'adjective',
    pronunciation: '/ˈkjʊriəs/',
    origin: 'From Latin curiosus, meaning careful or inquisitive.',
    originPeriod: 'Latin roots; entered English by the late Middle English period.',
    synonyms: ['interested', 'eager', 'inquiring'],
    commonWords: ['interested', 'eager', 'questioning'],
    basicInfo: 'Often describes someone who likes asking questions and exploring.',
    createdAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    reviews: 1,
  },
  {
    id: 'starter-2',
    term: 'Radiant',
    definition: 'Shining brightly or showing great happiness.',
    simpleDefinition: 'Very bright or very happy.',
    example: 'His radiant smile made everyone in the room feel welcome.',
    partOfSpeech: 'adjective',
    pronunciation: '/ˈreɪdiənt/',
    origin: 'From Latin radiare, meaning to shine.',
    originPeriod: 'Latin roots; used in English from around the early modern period.',
    synonyms: ['bright', 'glowing', 'beaming'],
    commonWords: ['bright', 'shiny', 'happy'],
    basicInfo: 'Can describe light, heat, beauty, or a very happy expression.',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    reviews: 0,
  },
  {
    id: 'starter-3',
    term: 'Resilient',
    definition: 'Able to recover quickly after something difficult.',
    simpleDefinition: 'Able to bounce back after something hard.',
    example: 'The resilient little tree grew again after the storm.',
    partOfSpeech: 'adjective',
    pronunciation: '/rɪˈzɪliənt/',
    origin: 'From Latin resilire, meaning to spring back.',
    originPeriod: 'Latin roots; became common in English in the 1600s.',
    synonyms: ['tough', 'flexible', 'strong'],
    commonWords: ['strong', 'tough', 'brave'],
    basicInfo: 'Often used for people, communities, materials, and systems.',
    createdAt: new Date().toISOString(),
    reviews: 2,
  },
];

const FALLBACK_DEFINITIONS = [
  'A feeling of calm confidence.',
  'To move carefully and quietly.',
  'Something that happens very rarely.',
  'Full of energy and excitement.',
  'To make something easier to understand.',
  'A surprising and useful discovery.',
];

function getDayKey() {
  const date = new Date();
  return getDayKeyForDate(date);
}

function getDayKeyForDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPreviousDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1);
  return getDayKeyForDate(date);
}

function formatReminderTime(settings: ReminderSettings) {
  const date = new Date();
  date.setHours(settings.hour, settings.minute, 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function buildQuiz(words: Word[]): QuizQuestion[] {
  return shuffle(words)
    .slice(0, 5)
    .map((word, index) => {
      const answer = word.simpleDefinition || word.definition;
      const otherDefinitions = words
        .filter((item) => item.id !== word.id)
        .map((item) => item.simpleDefinition || item.definition);
      const fallbacks = FALLBACK_DEFINITIONS.filter(
        (definition) => definition !== answer,
      );
      const distractors = shuffle(
        Array.from(
          new Set([
            ...otherDefinitions,
            ...fallbacks.slice(index),
            ...fallbacks.slice(0, index),
          ]),
        ),
      ).slice(0, 3);

      return {
        word,
        answer,
        options: shuffle([answer, ...distractors]),
      };
    });
}

function cleanLookupWord(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z'-]/g, '');
}

function fallbackExample(word: string) {
  const displayWord = word.trim() || 'word';
  return `I learned the word ${displayWord} and tried to use it in my own sentence.`;
}

function makeSimpleDefinition(definition: string, word: string) {
  const firstSentence = definition.split(/[.;:]/)[0]?.trim();
  if (!firstSentence) {
    return `A simple meaning for ${word.trim() || 'this word'}.`;
  }

  return firstSentence
    .replace(/^used to describe\s+/i, '')
    .replace(/^relating to\s+/i, 'About ')
    .replace(/\s+/g, ' ')
    .slice(0, 95);
}

function getCommonWords(words: string[]) {
  return Array.from(
    new Set(
      words
        .map((word) => word.trim().toLowerCase())
        .filter((word) => word && word.length <= 14 && !word.includes(' ')),
    ),
  ).slice(0, 6);
}

function inferOriginPeriod(origin: string) {
  const text = origin.trim();
  if (!text) {
    return 'Time period not available from this dictionary source.';
  }

  const centuryMatch = text.match(
    /\b(?:\d{1,2}(?:st|nd|rd|th)\s+century|1[0-9]{3}s|[2-9][0-9]{2}s)\b/i,
  );
  if (centuryMatch) {
    return `Source mentions ${centuryMatch[0]}.`;
  }

  const periods: { pattern: RegExp; label: string }[] = [
    {
      pattern: /old english/i,
      label: 'Old English period, roughly 450-1150 CE.',
    },
    {
      pattern: /middle english/i,
      label: 'Middle English period, roughly 1150-1500 CE.',
    },
    {
      pattern: /early modern english/i,
      label: 'Early Modern English period, roughly 1500-1700 CE.',
    },
    {
      pattern: /modern english/i,
      label: 'Modern English period, after about 1700 CE.',
    },
    {
      pattern: /latin/i,
      label:
        'Latin roots; exact English entry date is not available from this source.',
    },
    {
      pattern: /greek/i,
      label:
        'Greek roots; exact English entry date is not available from this source.',
    },
    {
      pattern: /old french|anglo-french|french/i,
      label:
        'French roots; many such words entered English after the Norman period.',
    },
  ];

  return (
    periods.find((period) => period.pattern.test(text))?.label ??
    'Time period not available from this dictionary source.'
  );
}

async function cancelReminder(settings: ReminderSettings) {
  if (settings.notificationId && Platform.OS !== 'web') {
    const Notifications = await getNotificationsModule();
    await Notifications.cancelScheduledNotificationAsync(settings.notificationId);
  }
}

async function scheduleDailyReminder(
  settings: ReminderSettings,
): Promise<ReminderSettings> {
  if (Platform.OS === 'web') {
    throw new Error('Daily reminders are available on iOS and Android.');
  }

  const Notifications = await getNotificationsModule();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily-review', {
      name: 'Daily Review',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: COLORS.green,
    });
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  let status = currentPermission.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    throw new Error('Notifications permission was not granted.');
  }

  await cancelReminder(settings);
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Keep your WordWiz streak going',
      body: 'Review a few words today so they stick.',
      data: { screen: 'quiz' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.hour,
      minute: settings.minute,
    },
  });

  return { ...settings, enabled: true, notificationId };
}

async function lookupWordDetails(rawTerm: string): Promise<WordDetails> {
  const lookupTerm = cleanLookupWord(rawTerm);
  if (!lookupTerm) {
    throw new Error('Type a word first.');
  }

  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
      lookupTerm,
    )}`,
  );

  if (!response.ok) {
    throw new Error('No dictionary entry found.');
  }

  const entries = (await response.json()) as DictionaryEntry[];
  const entry = entries[0];
  const meanings = entry?.meanings ?? [];
  const firstMeaning = meanings[0];
  const firstDefinition = firstMeaning?.definitions?.find(
    (item) => item.definition,
  );
  const exampleDefinition =
    firstMeaning?.definitions?.find((item) => item.example) ?? firstDefinition;
  const pronunciation =
    entry?.phonetic ??
    entry?.phonetics?.find((phonetic) => phonetic.text)?.text ??
    '';
  const synonyms = Array.from(
    new Set(
      meanings.flatMap((meaning) => [
        ...(meaning.synonyms ?? []),
        ...(meaning.definitions ?? []).flatMap(
          (definition) => definition.synonyms ?? [],
        ),
      ]),
    ),
  ).slice(0, 5);
  const partOfSpeech = firstMeaning?.partOfSpeech ?? '';
  const origin =
    entry?.origin ??
    'This dictionary source did not include an older word history for this entry.';

  return {
    definition: firstDefinition?.definition ?? '',
    simpleDefinition: makeSimpleDefinition(
      firstDefinition?.definition ?? '',
      rawTerm,
    ),
    example: exampleDefinition?.example ?? fallbackExample(rawTerm),
    partOfSpeech,
    pronunciation,
    origin,
    originPeriod: inferOriginPeriod(origin),
    synonyms,
    commonWords: getCommonWords(synonyms),
    basicInfo: [
      partOfSpeech ? `Usually used as a ${partOfSpeech}.` : '',
      meanings.length > 1
        ? `This word has ${meanings.length} common meaning groups.`
        : 'This word has one main meaning group in this dictionary.',
      synonyms.length ? `Similar words include ${synonyms.slice(0, 3).join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [words, setWords] = useState<Word[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical');
  const [isReady, setIsReady] = useState(false);
  const [showAddWord, setShowAddWord] = useState(false);
  const [quizProgress, setQuizProgress] = useState<QuizProgress | null>(null);
  const [analytics, setAnalytics] =
    useState<AnalyticsData>(EMPTY_ANALYTICS);
  const [reminderSettings, setReminderSettings] =
    useState<ReminderSettings>(DEFAULT_REMINDER);

  useEffect(() => {
    async function loadData() {
      try {
        const [savedWords, savedQuiz, savedAnalytics, savedReminder] =
          await Promise.all([
          AsyncStorage.getItem(WORDS_KEY),
          AsyncStorage.getItem(QUIZ_KEY),
          AsyncStorage.getItem(ANALYTICS_KEY),
          AsyncStorage.getItem(REMINDER_KEY),
        ]);
        const parsedQuiz: QuizProgress | null = savedQuiz
          ? JSON.parse(savedQuiz)
          : null;
        const parsedAnalytics: AnalyticsData = savedAnalytics
          ? JSON.parse(savedAnalytics)
          : EMPTY_ANALYTICS;

        setWords(savedWords ? JSON.parse(savedWords) : STARTER_WORDS);
        setQuizProgress(parsedQuiz);
        setReminderSettings(
          savedReminder
            ? { ...DEFAULT_REMINDER, ...JSON.parse(savedReminder) }
            : DEFAULT_REMINDER,
        );
        setAnalytics(
          !savedAnalytics && parsedQuiz
            ? {
                ...EMPTY_ANALYTICS,
                quizHistory: [
                  {
                    ...parsedQuiz,
                    id: `legacy-${parsedQuiz.date}`,
                    completedAt: `${parsedQuiz.date}T12:00:00.000Z`,
                    durationSeconds: Math.max(parsedQuiz.total * 12, 30),
                    answers: [],
                  },
                ],
              }
            : parsedAnalytics,
        );
      } catch {
        setWords(STARTER_WORDS);
      } finally {
        setIsReady(true);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(WORDS_KEY, JSON.stringify(words)).catch(() => {
        Alert.alert('Could not save', 'Please try adding your word again.');
      });
    }
  }, [isReady, words]);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics)).catch(
        () => {
          Alert.alert('Could not save', 'Your latest study stats may be missing.');
        },
      );
    }
  }, [analytics, isReady]);

  useEffect(() => {
    if (isReady) {
      AsyncStorage.setItem(
        REMINDER_KEY,
        JSON.stringify(reminderSettings),
      ).catch(() => {
        Alert.alert('Could not save', 'Your reminder setting may be missing.');
      });
    }
  }, [isReady, reminderSettings]);

  const sortedWords = useMemo(() => {
    return [...words].sort((first, second) => {
      if (sortMode === 'alphabetical') {
        return first.term.localeCompare(second.term);
      }
      return second.createdAt.localeCompare(first.createdAt);
    });
  }, [sortMode, words]);

  function addWord(
    term: string,
    definition: string,
    example: string,
    details: Partial<WordDetails> = {},
  ) {
    const newWord: Word = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      term: term.trim(),
      definition: definition.trim(),
      simpleDefinition: details.simpleDefinition?.trim(),
      example: example.trim(),
      partOfSpeech: details.partOfSpeech?.trim(),
      pronunciation: details.pronunciation?.trim(),
      origin: details.origin?.trim(),
      originPeriod: details.originPeriod?.trim(),
      synonyms: details.synonyms?.filter(Boolean).slice(0, 5),
      commonWords: details.commonWords?.filter(Boolean).slice(0, 6),
      basicInfo: details.basicInfo?.trim(),
      createdAt: new Date().toISOString(),
      reviews: 0,
    };
    setWords((current) => [newWord, ...current]);
    setShowAddWord(false);
  }

  function removeWord(word: Word) {
    Alert.alert(
      `Remove “${word.term}”?`,
      'You can always add it back later.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            setWords((current) => current.filter((item) => item.id !== word.id)),
        },
      ],
    );
  }

  function recordCardReview(
    wordId: string,
    remembered: boolean,
    durationSeconds: number,
  ) {
    if (remembered) {
      setWords((current) =>
        current.map((word) =>
          word.id === wordId ? { ...word, reviews: word.reviews + 1 } : word,
        ),
      );
    }
    setAnalytics((current) => ({
      ...current,
      cardHistory: [
        ...current.cardHistory,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          wordId,
          date: getDayKey(),
          studiedAt: new Date().toISOString(),
          remembered,
          durationSeconds,
        },
      ].slice(-500),
    }));
  }

  async function saveQuizProgress(
    score: number,
    total: number,
    durationSeconds: number,
    answers: QuizAnswer[],
  ) {
    const progress = { date: getDayKey(), score, total };
    setQuizProgress(progress);
    setAnalytics((current) => ({
      ...current,
      quizHistory: [
        ...current.quizHistory,
        {
          ...progress,
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          completedAt: new Date().toISOString(),
          durationSeconds,
          answers,
        },
      ].slice(-100),
    }));
    await AsyncStorage.setItem(QUIZ_KEY, JSON.stringify(progress));
  }

  async function updateReminderSettings(nextSettings: ReminderSettings) {
    try {
      if (nextSettings.enabled) {
        const scheduled = await scheduleDailyReminder(nextSettings);
        setReminderSettings(scheduled);
        Alert.alert(
          'Reminder set',
          `WordWiz will remind you daily at ${formatReminderTime(scheduled)}.`,
        );
        return;
      }

      await cancelReminder(reminderSettings);
      setReminderSettings({ ...nextSettings, notificationId: undefined });
    } catch (error) {
      Alert.alert(
        'Reminder not set',
        error instanceof Error
          ? error.message
          : 'Please check notification permissions and try again.',
      );
    }
  }

  const todayComplete = quizProgress?.date === getDayKey();

  if (!isReady) {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.logoBadge}>
          <Ionicons name="sparkles" size={30} color={COLORS.white} />
        </View>
        <Text style={styles.loadingTitle}>WordWiz</Text>
      </View>
    );
  }

  return (
    <View style={styles.app}>
      <StatusBar style="dark" />
      <View style={styles.backgroundAura}>
        <View style={styles.backgroundBlobTop} />
        <View style={styles.backgroundBlobMiddle} />
        <View style={styles.backgroundBlobBottom} />
      </View>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {activeTab === 'home' && (
          <HomeScreen
            words={words}
            analytics={analytics}
            reminderSettings={reminderSettings}
            onAddWord={() => setShowAddWord(true)}
            onStudy={() => setActiveTab('cards')}
            onQuiz={() => setActiveTab('quiz')}
            onStats={() => setActiveTab('dashboard')}
          />
        )}
        {activeTab === 'words' && (
          <WordsScreen
            words={sortedWords}
            sortMode={sortMode}
            onChangeSort={setSortMode}
            onAdd={() => setShowAddWord(true)}
            onRemove={removeWord}
            onStudy={() => setActiveTab('cards')}
          />
        )}
        {activeTab === 'cards' && (
          <CardsScreen words={words} onReview={recordCardReview} />
        )}
        {activeTab === 'quiz' && (
          <QuizScreen
            words={words}
            progress={todayComplete ? quizProgress : null}
            onComplete={saveQuizProgress}
          />
        )}
        {activeTab === 'dashboard' && (
          <DashboardScreen
            words={words}
            analytics={analytics}
            reminderSettings={reminderSettings}
            onUpdateReminder={updateReminderSettings}
          />
        )}
      </SafeAreaView>

      <BottomTabs
        activeTab={activeTab}
        bottomInset={insets.bottom}
        quizComplete={todayComplete}
        onChange={setActiveTab}
      />

      <AddWordModal
        visible={showAddWord}
        onClose={() => setShowAddWord(false)}
        onAdd={addWord}
      />
    </View>
  );
}

function ScreenHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  const theme = getHeaderTheme(eyebrow);

  return (
    <View style={styles.header}>
      <View
        style={[
          styles.screenHeaderCard,
          { backgroundColor: theme.background },
        ]}
      >
        <View
          style={[
            styles.screenHeaderCloudOne,
            { backgroundColor: theme.cloudOne },
          ]}
        />
        <View
          style={[
            styles.screenHeaderCloudTwo,
            { backgroundColor: theme.cloudTwo },
          ]}
        />
        <View
          style={[
            styles.screenHeaderCloudThree,
            { backgroundColor: theme.cloudThree },
          ]}
        />
        <View style={styles.screenHeaderPlane}>
          <Ionicons name={theme.icon} size={22} color={theme.accent} />
        </View>
        <View style={styles.brandRow}>
          <View style={[styles.miniLogo, { backgroundColor: theme.accent }]}>
            <Ionicons name="sparkles" size={17} color={COLORS.white} />
          </View>
          <Text style={[styles.brandName, { color: theme.accent }]}>WORDWIZ</Text>
        </View>
        <View style={styles.headerTextCard}>
          <Text style={[styles.eyebrow, { color: theme.accent }]}>
            {eyebrow}
          </Text>
          <Text style={styles.screenTitle}>{title}</Text>
          <Text style={styles.screenSubtitle}>{subtitle}</Text>
        </View>
      </View>
    </View>
  );
}

function getHeaderTheme(eyebrow: string) {
  if (eyebrow.includes('COLLECTION')) {
    return {
      accent: COLORS.teal,
      background: '#DDF6ED',
      cloudOne: '#EAF2FF',
      cloudTwo: '#FFF0DC',
      cloudThree: '#FFFFFF',
      icon: 'book-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (eyebrow.includes('FLASHCARDS')) {
    return {
      accent: COLORS.purple,
      background: '#E9E2FF',
      cloudOne: '#FFEAF1',
      cloudTwo: '#EAF2FF',
      cloudThree: '#FFFFFF',
      icon: 'albums-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (eyebrow.includes('QUIZ')) {
    return {
      accent: COLORS.orange,
      background: '#FFE8C8',
      cloudOne: '#FFF7DF',
      cloudTwo: '#E8FBF4',
      cloudThree: '#FFFFFF',
      icon: 'trophy-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  if (eyebrow.includes('PROGRESS')) {
    return {
      accent: COLORS.blue,
      background: '#DCEBFF',
      cloudOne: '#F2EFFF',
      cloudTwo: '#E8FBF4',
      cloudThree: '#FFFFFF',
      icon: 'bar-chart-outline' as keyof typeof Ionicons.glyphMap,
    };
  }
  return {
    accent: COLORS.purple,
    background: '#D9E3FF',
    cloudOne: '#FFE4EC',
    cloudTwo: '#FFF3E8',
    cloudThree: '#FFFFFF',
    icon: 'paper-plane' as keyof typeof Ionicons.glyphMap,
  };
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getTodayReviewCount(analytics: AnalyticsData) {
  const today = getDayKey();
  return (
    analytics.cardHistory.filter((event) => event.date === today).length +
    analytics.quizHistory
      .filter((attempt) => attempt.date === today)
      .reduce((total, attempt) => total + attempt.total, 0)
  );
}

function HomeScreen({
  words,
  analytics,
  reminderSettings,
  onAddWord,
  onStudy,
  onQuiz,
  onStats,
}: {
  words: Word[];
  analytics: AnalyticsData;
  reminderSettings: ReminderSettings;
  onAddWord: () => void;
  onStudy: () => void;
  onQuiz: () => void;
  onStats: () => void;
}) {
  const mastery = words.map((word) => getWordMastery(word, analytics));
  const overallMastery = words.length
    ? Math.round(mastery.reduce((total, score) => total + score, 0) / words.length)
    : 0;
  const strongWords = mastery.filter((score) => score >= 80).length;
  const learningWords = words.length - strongWords;
  const totalQuizQuestions = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.total,
    0,
  );
  const totalCorrect = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.score,
    0,
  );
  const accuracy = totalQuizQuestions
    ? Math.round((totalCorrect / totalQuizQuestions) * 100)
    : 0;
  const totalSeconds =
    analytics.quizHistory.reduce(
      (total, attempt) => total + attempt.durationSeconds,
      0,
    ) +
    analytics.cardHistory.reduce(
      (total, event) => total + event.durationSeconds,
      0,
    );
  const streakStats = calculateStreakStats(analytics);
  const todayReviews = getTodayReviewCount(analytics);
  const nextWords = [...words]
    .sort(
      (first, second) =>
        getWordMastery(first, analytics) - getWordMastery(second, analytics),
    )
    .slice(0, 2);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.homeContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.homeHero}>
        <View style={styles.heroCloudOne} />
        <View style={styles.heroCloudTwo} />
        <View style={styles.heroCloudThree} />
        <View style={styles.homeTopRow}>
          <View style={styles.avatarBadge}>
            <Text style={styles.avatarText}>W</Text>
          </View>
          <View style={styles.homeStatsPill}>
            <Ionicons name="flame" size={15} color={COLORS.yellow} />
            <Text style={styles.homeStatsPillText}>{streakStats.current}</Text>
            <Ionicons name="school" size={15} color={COLORS.purpleDark} />
            <Text style={styles.homeStatsPillText}>{overallMastery}%</Text>
          </View>
        </View>
        <View style={styles.paperPlane}>
          <Ionicons name="paper-plane" size={28} color={COLORS.white} />
        </View>
        <View style={styles.heroGreeting}>
          <Text style={styles.homeTitle}>{getGreeting()}, WordWiz</Text>
          <Text style={styles.homeSubtitle}>
            {words.length === 0
              ? 'Start your first word today.'
              : `${words.length} words saved · ${strongWords} feeling strong`}
          </Text>
        </View>
      </View>

      <View style={styles.homeOverviewCard}>
        <View style={styles.overviewHeader}>
          <Text style={styles.homeSectionTitle}>Today’s learning</Text>
          <View style={styles.overviewProgressRing}>
            <Text style={styles.overviewProgressText}>{Math.min(todayReviews, 5)}/5</Text>
          </View>
        </View>
        <View style={styles.homeIdeaGrid}>
          <HomeMiniCard
            color={COLORS.bluePale}
            accent={COLORS.blue}
            icon="book-outline"
            title={`${words.length} words`}
            subtitle={`${learningWords} still learning`}
          />
          <HomeMiniCard
            color={COLORS.orangePale}
            accent={COLORS.orange}
            icon="checkmark-circle-outline"
            title={`${accuracy}% quiz`}
            subtitle={`${analytics.quizHistory.length} quizzes done`}
          />
        </View>
        <View style={styles.homeDottedLine} />
        <Pressable
          onPress={words.length > 0 ? onStudy : onAddWord}
          style={({ pressed }) => [
            styles.homePrimaryButton,
            pressed && styles.primaryButtonPressed,
          ]}
        >
          <Text style={styles.homePrimaryButtonText}>
            {words.length > 0 ? 'Start review' : 'Add your first word'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.homeSkillCard}>
        <View style={styles.homeSkillCopy}>
          <Text style={styles.homeSkillTitle}>
            {formatStudyTime(Math.max(totalSeconds, 0))} spent learning
          </Text>
          <Text style={styles.homeSkillSubtitle}>
            Mastery is about {overallMastery}% across your saved words.
          </Text>
        </View>
        <View style={styles.homeSkillTrack}>
          <View
            style={[
              styles.homeSkillFill,
              { width: `${Math.max(overallMastery, words.length ? 6 : 0)}%` },
            ]}
          />
        </View>
        <Pressable onPress={onStats} style={styles.homeStartButton}>
          <Text style={styles.homeStartButtonText}>Stats</Text>
        </Pressable>
      </View>

      <View style={styles.homePromptSection}>
        <Text style={styles.homeSectionTitle}>What’s next?</Text>
        <View style={styles.nextActionRow}>
          <HomeAction
            accent={COLORS.teal}
            pale={COLORS.tealPale}
            icon="add"
            label="Add word"
            onPress={onAddWord}
          />
          <HomeAction
            accent={COLORS.purple}
            pale={COLORS.purplePale}
            icon="albums-outline"
            label="Cards"
            onPress={onStudy}
          />
          <HomeAction
            accent={COLORS.orange}
            pale={COLORS.orangePale}
            icon="trophy-outline"
            label="Quiz"
            onPress={onQuiz}
          />
          <HomeAction
            accent={COLORS.blue}
            pale={COLORS.bluePale}
            icon="bar-chart-outline"
            label="Stats"
            onPress={onStats}
          />
        </View>
      </View>

      {nextWords.length > 0 && (
        <View style={styles.nextWordsCard}>
          <Text style={styles.homeSectionTitle}>Words to review</Text>
          {nextWords.map((word) => (
            <View key={word.id} style={styles.nextWordRow}>
              <View style={styles.nextWordIcon}>
                <Text style={styles.nextWordInitial}>
                  {word.term.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.nextWordCopy}>
                <Text style={styles.nextWordTerm}>{word.term}</Text>
                <Text numberOfLines={1} style={styles.nextWordDefinition}>
                  {word.simpleDefinition || word.definition}
                </Text>
              </View>
              <Text style={styles.nextWordMastery}>
                {getWordMastery(word, analytics)}%
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.homeReminderStrip}>
        <Ionicons
          name={reminderSettings.enabled ? 'notifications' : 'notifications-outline'}
          size={18}
          color={COLORS.blue}
        />
        <Text style={styles.homeReminderText}>
          {reminderSettings.enabled
            ? `Daily reminder set for ${formatReminderTime(reminderSettings)}`
            : 'Daily reminders are off. Turn them on in Stats.'}
        </Text>
      </View>
    </ScrollView>
  );
}

function HomeMiniCard({
  color,
  accent,
  icon,
  title,
  subtitle,
}: {
  color: string;
  accent: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={[styles.homeMiniCard, { backgroundColor: color }]}>
      <View style={styles.homeMiniIcon}>
        <Ionicons name={icon} size={18} color={accent} />
      </View>
      <Text style={styles.homeMiniTitle}>{title}</Text>
      <Text style={styles.homeMiniSubtitle}>{subtitle}</Text>
    </View>
  );
}

function HomeAction({
  accent,
  pale,
  icon,
  label,
  onPress,
}: {
  accent: string;
  pale: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.homeActionButton,
        { backgroundColor: pale, borderColor: pale },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={23} color={accent} />
      <Text style={styles.homeActionLabel}>{label}</Text>
    </Pressable>
  );
}

function WordsScreen({
  words,
  sortMode,
  onChangeSort,
  onAdd,
  onRemove,
  onStudy,
}: {
  words: Word[];
  sortMode: SortMode;
  onChangeSort: (mode: SortMode) => void;
  onAdd: () => void;
  onRemove: (word: Word) => void;
  onStudy: () => void;
}) {
  return (
    <View style={styles.screen}>
      <FlatList
        data={words}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            <ScreenHeader
              eyebrow="MY COLLECTION"
              title="Words worth knowing"
              subtitle="Save new discoveries and make them yours."
            />

            <View style={styles.progressCard}>
              <View style={styles.progressIcon}>
                <Ionicons name="book" size={25} color={COLORS.purpleDark} />
              </View>
              <View style={styles.progressCopy}>
                <Text style={styles.progressNumber}>{words.length} words</Text>
                <Text style={styles.progressLabel}>
                  {words.length === 0
                    ? 'Your collection is ready to grow'
                    : 'Your vocabulary is growing!'}
                </Text>
              </View>
              {words.length > 0 && (
                <Pressable onPress={onStudy} style={styles.studyButton}>
                  <Ionicons name="play" size={15} color={COLORS.white} />
                  <Text style={styles.studyButtonText}>STUDY</Text>
                </Pressable>
              )}
            </View>

            <Pressable onPress={onAdd} style={styles.addButton}>
              <View style={styles.addIcon}>
                <Ionicons name="add" size={25} color={COLORS.white} />
              </View>
              <View style={styles.addButtonCopy}>
                <Text style={styles.addButtonTitle}>Add a new word</Text>
                <Text style={styles.addButtonSubtitle}>
                  What did you discover today?
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={23} color={COLORS.white} />
            </Pressable>

            <View style={styles.listToolbar}>
              <Text style={styles.sectionTitle}>YOUR WORDS</Text>
              <View style={styles.segmentedControl}>
                <SortButton
                  active={sortMode === 'alphabetical'}
                  icon="text"
                  onPress={() => onChangeSort('alphabetical')}
                />
                <SortButton
                  active={sortMode === 'recent'}
                  icon="time"
                  onPress={() => onChangeSort('recent')}
                />
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="leaf-outline" size={38} color={COLORS.green} />
            </View>
            <Text style={styles.emptyTitle}>Start your collection</Text>
            <Text style={styles.emptyText}>
              Add a word you heard, read, or wondered about.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <WordRow word={item} index={index} onRemove={onRemove} />
        )}
      />
    </View>
  );
}

function SortButton({
  active,
  icon,
  onPress,
}: {
  active: boolean;
  icon: 'text' | 'time';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        icon === 'text' ? 'Sort alphabetically' : 'Sort by newest'
      }
      onPress={onPress}
      style={[styles.sortButton, active && styles.sortButtonActive]}
    >
      <Ionicons
        name={icon === 'text' ? 'text-outline' : 'time-outline'}
        size={17}
        color={active ? COLORS.purpleDark : COLORS.muted}
      />
    </Pressable>
  );
}

function WordRow({
  word,
  index,
  onRemove,
}: {
  word: Word;
  index: number;
  onRemove: (word: Word) => void;
}) {
  const tile = TILE_COLORS[index % TILE_COLORS.length];
  return (
    <Pressable
      onLongPress={() => onRemove(word)}
      style={({ pressed }) => [
        styles.wordRow,
        { backgroundColor: tile.pale, borderColor: `${tile.accent}33` },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.letterBadge, { backgroundColor: COLORS.white }]}>
        <Text style={[styles.letterText, { color: tile.accent }]}>
          {word.term.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.wordRowCopy}>
        <View style={styles.wordTitleRow}>
          <Text style={styles.wordTerm}>{word.term}</Text>
          {word.partOfSpeech && (
            <Text style={styles.partOfSpeechPill}>{word.partOfSpeech}</Text>
          )}
        </View>
        <Text numberOfLines={2} style={styles.wordDefinition}>
          {word.simpleDefinition || word.definition}
        </Text>
        {word.commonWords && word.commonWords.length > 0 && (
          <Text numberOfLines={1} style={styles.commonWordsLine}>
            Common words: {word.commonWords.slice(0, 3).join(', ')}
          </Text>
        )}
        {word.pronunciation && (
          <Text numberOfLines={1} style={styles.wordMeta}>
            {word.pronunciation}
          </Text>
        )}
      </View>
      <View style={styles.reviewCount}>
        <Ionicons name="refresh" size={13} color={COLORS.muted} />
        <Text style={styles.reviewText}>{word.reviews}</Text>
      </View>
    </Pressable>
  );
}

function CardsScreen({
  words,
  onReview,
}: {
  words: Word[];
  onReview: (
    wordId: string,
    remembered: boolean,
    durationSeconds: number,
  ) => void;
}) {
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [cardStartedAt, setCardStartedAt] = useState(Date.now());
  const studyWords = useMemo(() => shuffle(words), [words]);
  const current = studyWords[cardIndex % Math.max(studyWords.length, 1)];

  useEffect(() => {
    setCardIndex(0);
    setShowAnswer(false);
    setCardStartedAt(Date.now());
  }, [words.length]);

  function nextCard(remembered: boolean) {
    if (!current) return;
    const durationSeconds = Math.max(
      1,
      Math.min(120, Math.round((Date.now() - cardStartedAt) / 1000)),
    );
    onReview(current.id, remembered, durationSeconds);
    setShowAnswer(false);
    setCardIndex((index) => (index + 1) % studyWords.length);
    setCardStartedAt(Date.now());
  }

  if (words.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="FLASHCARDS"
          title="Practice makes progress"
          subtitle="Your saved words will turn into study cards."
        />
        <EmptyPractice icon="albums-outline" label="Add a word to begin studying." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.cardScreenContent}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="FLASHCARDS"
        title="Practice makes progress"
        subtitle="Tap the card, then tell us how it felt."
      />

      <View style={styles.cardProgressRow}>
        <Text style={styles.cardProgressText}>
          CARD {(cardIndex % studyWords.length) + 1} OF {studyWords.length}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${
                  (((cardIndex % studyWords.length) + 1) / studyWords.length) *
                  100
                }%`,
              },
            ]}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showAnswer ? 'Definition shown' : 'Reveal definition'}
        onPress={() => setShowAnswer((shown) => !shown)}
        style={({ pressed }) => [
          styles.flashcard,
          showAnswer && styles.flashcardRevealed,
          pressed && styles.flashcardPressed,
        ]}
      >
        <View style={styles.cardTopRow}>
          <View
            style={[
              styles.cardLabel,
              showAnswer && styles.cardLabelRevealed,
            ]}
          >
            <Text
              style={[
                styles.cardLabelText,
                showAnswer && styles.cardLabelTextRevealed,
              ]}
            >
              {showAnswer ? 'MEANING' : 'YOUR WORD'}
            </Text>
          </View>
          <Ionicons
            name={showAnswer ? 'bulb' : 'eye-outline'}
            size={23}
            color={showAnswer ? COLORS.yellow : COLORS.blue}
          />
        </View>

        <View style={styles.flashcardBody}>
          <Text style={styles.flashcardWord}>{current.term}</Text>
          {!showAnswer && (
            <View style={styles.flashcardMetaRow}>
              {current.partOfSpeech && (
                <Text style={styles.flashcardMetaPill}>
                  {current.partOfSpeech}
                </Text>
              )}
              {current.pronunciation && (
                <Text style={styles.flashcardPronunciation}>
                  {current.pronunciation}
                </Text>
              )}
            </View>
          )}
          {showAnswer ? (
            <>
              <Text style={styles.flashcardDefinition}>
                {current.simpleDefinition || current.definition}
              </Text>
              {current.simpleDefinition && (
                <Text style={styles.fullDefinitionText}>
                  Full meaning: {current.definition}
                </Text>
              )}
              <WordInfoPanel word={current} />
              <View style={styles.exampleBox}>
                <Ionicons
                  name="chatbox-ellipses-outline"
                  size={19}
                  color={COLORS.purple}
                />
                <Text style={styles.exampleText}>“{current.example}”</Text>
              </View>
            </>
          ) : (
            <View style={styles.tapHint}>
              <Ionicons name="finger-print" size={23} color={COLORS.muted} />
              <Text style={styles.tapHintText}>Tap to reveal the meaning</Text>
            </View>
          )}
        </View>
      </Pressable>

      {showAnswer ? (
        <View style={styles.cardActions}>
          <Pressable
            onPress={() => nextCard(false)}
            style={({ pressed }) => [
              styles.answerButton,
              styles.againButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="refresh" size={21} color={COLORS.red} />
            <Text style={[styles.answerButtonText, { color: COLORS.red }]}>
              AGAIN
            </Text>
          </Pressable>
          <Pressable
            onPress={() => nextCard(true)}
            style={({ pressed }) => [
              styles.answerButton,
              styles.gotItButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
            <Text style={[styles.answerButtonText, { color: COLORS.white }]}>
              GOT IT
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.cardTip}>
          Try saying the definition before you flip the card.
        </Text>
      )}
    </ScrollView>
  );
}

function WordInfoPanel({ word }: { word: Word }) {
  const hasInfo =
    word.partOfSpeech ||
    word.pronunciation ||
    word.origin ||
    word.originPeriod ||
    word.basicInfo ||
    word.commonWords?.length ||
    word.synonyms?.length;

  if (!hasInfo) return null;

  return (
    <View style={styles.wordInfoPanel}>
      <View style={styles.infoChipRow}>
        {word.partOfSpeech && (
          <InfoChip icon="pricetag-outline" text={word.partOfSpeech} />
        )}
        {word.pronunciation && (
          <InfoChip icon="volume-medium-outline" text={word.pronunciation} />
        )}
      </View>
      {word.basicInfo && (
        <Text style={styles.wordInfoText}>{word.basicInfo}</Text>
      )}
      {word.commonWords && word.commonWords.length > 0 && (
        <View style={styles.commonWordsBox}>
          <Text style={styles.commonWordsTitle}>COMMON WORDS</Text>
          <View style={styles.commonWordsWrap}>
            {word.commonWords.map((commonWord) => (
              <Text key={commonWord} style={styles.commonWordChip}>
                {commonWord}
              </Text>
            ))}
          </View>
        </View>
      )}
      {word.synonyms && word.synonyms.length > 0 && (
        <Text style={styles.wordInfoText}>
          Similar words: {word.synonyms.join(', ')}
        </Text>
      )}
      {(word.origin || word.originPeriod) && (
        <View style={styles.originBox}>
          <Ionicons name="library-outline" size={17} color={COLORS.blue} />
          <View style={styles.originCopy}>
            {word.origin && (
              <>
                <Text style={styles.originLabel}>WHERE FROM</Text>
                <Text style={styles.originText}>{word.origin}</Text>
              </>
            )}
            {word.originPeriod && (
              <>
                <Text style={styles.originLabel}>TIME PERIOD</Text>
                <Text style={styles.originText}>{word.originPeriod}</Text>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function InfoChip({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.infoChip}>
      <Ionicons name={icon} size={13} color={COLORS.purpleDark} />
      <Text style={styles.infoChipText}>{text}</Text>
    </View>
  );
}

function QuizScreen({
  words,
  progress,
  onComplete,
}: {
  words: Word[];
  progress: QuizProgress | null;
  onComplete: (
    score: number,
    total: number,
    durationSeconds: number,
    answers: QuizAnswer[],
  ) => Promise<void>;
}) {
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finishedScore, setFinishedScore] = useState<number | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [quizStartedAt, setQuizStartedAt] = useState(Date.now());

  function startQuiz() {
    setQuiz(buildQuiz(words));
    setQuestionIndex(0);
    setSelected(null);
    setScore(0);
    setFinishedScore(null);
    setAnswers([]);
    setQuizStartedAt(Date.now());
  }

  function chooseAnswer(option: string) {
    if (selected) return;
    const question = quiz[questionIndex];
    setSelected(option);
    const correct = option === question.answer;
    if (correct) setScore((current) => current + 1);
    setAnswers((current) => [
      ...current,
      { wordId: question.word.id, correct },
    ]);
  }

  async function nextQuestion() {
    const finalScore = score;
    if (questionIndex === quiz.length - 1) {
      const durationSeconds = Math.max(
        1,
        Math.round((Date.now() - quizStartedAt) / 1000),
      );
      setFinishedScore(finalScore);
      await onComplete(finalScore, quiz.length, durationSeconds, answers);
      return;
    }
    setQuestionIndex((index) => index + 1);
    setSelected(null);
  }

  if (progress && quiz.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title="Today’s practice"
          subtitle="A little review each day makes words stick."
        />
        <QuizComplete score={progress.score} total={progress.total} />
      </ScrollView>
    );
  }

  if (words.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title="Today’s practice"
          subtitle="A little review each day makes words stick."
        />
        <EmptyPractice
          icon="help-circle-outline"
          label="Add a word to unlock your daily quiz."
        />
      </ScrollView>
    );
  }

  if (finishedScore !== null) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title="Practice complete!"
          subtitle="You gave your brain a useful workout."
        />
        <QuizComplete score={finishedScore} total={quiz.length} />
      </ScrollView>
    );
  }

  if (quiz.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.singleScreenContent}>
        <ScreenHeader
          eyebrow="DAILY QUIZ"
          title="Today’s practice"
          subtitle="A little review each day makes words stick."
        />
        <View style={styles.quizIntroCard}>
          <View style={styles.quizIllustration}>
            <Ionicons name="trophy" size={48} color={COLORS.yellow} />
            <View style={styles.sparkleOne}>
              <Ionicons name="sparkles" size={20} color={COLORS.purple} />
            </View>
            <View style={styles.sparkleTwo}>
              <Ionicons name="star" size={18} color={COLORS.blue} />
            </View>
          </View>
          <Text style={styles.quizIntroTitle}>Ready for today’s challenge?</Text>
          <Text style={styles.quizIntroText}>
            You’ll match up to 5 words with their meanings. It only takes a
            minute.
          </Text>
          <View style={styles.quizFacts}>
            <QuizFact icon="time-outline" text="About 1 minute" />
            <QuizFact
              icon="help-circle-outline"
              text={`${Math.min(words.length, 5)} questions`}
            />
          </View>
          <Pressable
            onPress={startQuiz}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>START QUIZ</Text>
            <Ionicons name="arrow-forward" size={21} color={COLORS.white} />
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const question = quiz[questionIndex];
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.quizContent}
      showsVerticalScrollIndicator={false}
    >
      <ScreenHeader
        eyebrow="DAILY QUIZ"
        title="Choose the meaning"
        subtitle={`Question ${questionIndex + 1} of ${quiz.length}`}
      />
      <View style={styles.quizProgressTrack}>
        <View
          style={[
            styles.quizProgressFill,
            { width: `${((questionIndex + 1) / quiz.length) * 100}%` },
          ]}
        />
      </View>

      <View style={styles.questionCard}>
        <Text style={styles.questionPrompt}>WHAT DOES THIS WORD MEAN?</Text>
        <Text style={styles.questionWord}>{question.word.term}</Text>
      </View>

      <View style={styles.optionsList}>
        {question.options.map((option, index) => {
          const isAnswer = option === question.answer;
          const isSelected = option === selected;
          const showCorrect = Boolean(selected) && isAnswer;
          const showWrong = Boolean(selected) && isSelected && !isAnswer;
          return (
            <Pressable
              key={option}
              onPress={() => chooseAnswer(option)}
              style={({ pressed }) => [
                styles.optionButton,
                showCorrect && styles.optionCorrect,
                showWrong && styles.optionWrong,
                pressed && !selected && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.optionLetter,
                  showCorrect && styles.optionLetterCorrect,
                  showWrong && styles.optionLetterWrong,
                ]}
              >
                {showCorrect || showWrong ? (
                  <Ionicons
                    name={showCorrect ? 'checkmark' : 'close'}
                    size={18}
                    color={COLORS.white}
                  />
                ) : (
                  <Text style={styles.optionLetterText}>
                    {String.fromCharCode(65 + index)}
                  </Text>
                )}
              </View>
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          );
        })}
      </View>

      {selected && (
        <View
          style={[
            styles.feedbackBox,
            selected === question.answer
              ? styles.feedbackCorrect
              : styles.feedbackWrong,
          ]}
        >
          <Ionicons
            name={
              selected === question.answer
                ? 'checkmark-circle'
                : 'heart-outline'
            }
            size={23}
            color={
              selected === question.answer ? COLORS.greenDark : COLORS.red
            }
          />
          <View style={styles.feedbackCopy}>
            <Text style={styles.feedbackTitle}>
              {selected === question.answer ? 'Nicely done!' : 'Keep learning!'}
            </Text>
            <Text style={styles.feedbackText}>
              {selected === question.answer
                ? 'You matched it perfectly.'
                : `“${question.word.term}” means ${question.answer.toLowerCase()}`}
            </Text>
          </View>
        </View>
      )}

      <Pressable
        disabled={!selected}
        onPress={nextQuestion}
        style={({ pressed }) => [
          styles.primaryButton,
          !selected && styles.primaryButtonDisabled,
          pressed && selected && styles.primaryButtonPressed,
        ]}
      >
        <Text style={styles.primaryButtonText}>
          {questionIndex === quiz.length - 1 ? 'SEE RESULTS' : 'CONTINUE'}
        </Text>
        <Ionicons name="arrow-forward" size={21} color={COLORS.white} />
      </Pressable>
    </ScrollView>
  );
}

function QuizFact({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.quizFact}>
      <Ionicons name={icon} size={19} color={COLORS.blue} />
      <Text style={styles.quizFactText}>{text}</Text>
    </View>
  );
}

function QuizComplete({ score, total }: { score: number; total: number }) {
  const percentage = total ? Math.round((score / total) * 100) : 0;
  return (
    <View style={styles.completeCard}>
      <View style={styles.completeBadge}>
        <Ionicons name="checkmark" size={44} color={COLORS.white} />
      </View>
      <Text style={styles.completeTitle}>Daily goal complete</Text>
      <Text style={styles.completeScore}>
        {score} <Text style={styles.completeTotal}>/ {total}</Text>
      </Text>
      <Text style={styles.completeText}>
        {percentage === 100
          ? 'A perfect round. Those words are looking familiar!'
          : percentage >= 60
            ? 'Great practice. Every review makes your memory stronger.'
            : 'Good start. The flashcards are ready for another look.'}
      </Text>
      <View style={styles.comeBackPill}>
        <Ionicons name="sunny" size={18} color={COLORS.yellow} />
        <Text style={styles.comeBackText}>Come back tomorrow for a new quiz</Text>
      </View>
    </View>
  );
}

function EmptyPractice({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.emptyPractice}>
      <View style={styles.emptyPracticeIcon}>
        <Ionicons name={icon} size={44} color={COLORS.blue} />
      </View>
      <Text style={styles.emptyPracticeTitle}>Your practice space is ready</Text>
      <Text style={styles.emptyPracticeText}>{label}</Text>
    </View>
  );
}

function getRecentDays(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (count - index - 1));
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return {
      key: `${year}-${month}-${day}`,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
    };
  });
}

function getWordMastery(
  word: Word,
  analytics: AnalyticsData,
) {
  const cardEvents = analytics.cardHistory.filter(
    (event) => event.wordId === word.id,
  );
  const quizAnswers = analytics.quizHistory.flatMap((attempt) =>
    attempt.answers.filter((answer) => answer.wordId === word.id),
  );
  const cardScore = cardEvents.reduce(
    (total, event) => total + (event.remembered ? 10 : -4),
    0,
  );
  const quizScore = quizAnswers.reduce(
    (total, answer) => total + (answer.correct ? 14 : -6),
    0,
  );

  return Math.max(
    0,
    Math.min(100, word.reviews * 12 + cardScore + quizScore),
  );
}

function formatStudyTime(seconds: number) {
  if (seconds < 60) return seconds === 0 ? '0m' : '<1m';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getActivityDates(analytics: AnalyticsData) {
  return new Set([
    ...analytics.cardHistory.map((event) => event.date),
    ...analytics.quizHistory.map((attempt) => attempt.date),
  ]);
}

function countBackwardsStreak(activeDates: Set<string>, startDay: string) {
  let streak = 0;
  let cursor = startDay;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = getPreviousDayKey(cursor);
  }
  return streak;
}

function calculateStreakStats(analytics: AnalyticsData): StreakStats {
  const activeDates = getActivityDates(analytics);
  const today = getDayKey();
  const yesterday = getPreviousDayKey(today);
  const todayDone = activeDates.has(today);
  const current = countBackwardsStreak(
    activeDates,
    todayDone ? today : yesterday,
  );
  const sortedDates = Array.from(activeDates).sort();
  let longest = 0;
  let run = 0;
  let previous = '';

  sortedDates.forEach((day) => {
    run = previous && getPreviousDayKey(day) === previous ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  });

  return {
    current,
    longest,
    todayDone,
    activeDates,
  };
}

function calculateStreak(analytics: AnalyticsData) {
  return calculateStreakStats(analytics).current;
}

function getStreakWeek(stats: StreakStats) {
  return getRecentDays(7).map((day) => ({
    ...day,
    active: stats.activeDates.has(day.key),
    today: day.key === getDayKey(),
  }));
}

function getStreakMessage(stats: StreakStats) {
  if (stats.todayDone) {
    return 'Nice. Your streak is safe for today.';
  }
  if (stats.current > 0) {
    return 'Review today to keep your streak alive.';
  }
  return 'Start a new streak with one quick review today.';
}

function DashboardScreen({
  words,
  analytics,
  reminderSettings,
  onUpdateReminder,
}: {
  words: Word[];
  analytics: AnalyticsData;
  reminderSettings: ReminderSettings;
  onUpdateReminder: (settings: ReminderSettings) => void;
}) {
  const recentDays = getRecentDays(7);
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
    }))
    .sort((first, second) => second.score - first.score);
  const overallMastery = words.length
    ? Math.round(
        mastery.reduce((total, item) => total + item.score, 0) / words.length,
      )
    : 0;
  const strongWords = mastery.filter((item) => item.score >= 80).length;
  const buildingWords = mastery.filter(
    (item) => item.score >= 40 && item.score < 80,
  ).length;
  const learningWords = Math.max(
    0,
    words.length - strongWords - buildingWords,
  );
  const remainingReviews = mastery.reduce(
    (total, item) =>
      total + (item.score >= 80 ? 0 : Math.ceil((80 - item.score) / 14)),
    0,
  );
  const weeklyActivity = recentDays.map((day) => ({
    ...day,
    value:
      analytics.cardHistory.filter((event) => event.date === day.key).length +
      analytics.quizHistory
        .filter((attempt) => attempt.date === day.key)
        .reduce((total, attempt) => total + attempt.total, 0),
  }));
  const maxActivity = Math.max(1, ...weeklyActivity.map((day) => day.value));
  const recentQuizzes = analytics.quizHistory.slice(-5).reverse();
  const streakStats = calculateStreakStats(analytics);
  const streak = streakStats.current;
  const streakWeek = getStreakWeek(streakStats);
  const reminderTime = formatReminderTime(reminderSettings);

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

      <View style={styles.dashboardHero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroLabel}>ESTIMATED MASTERY</Text>
          <Text style={styles.heroValue}>{overallMastery}%</Text>
          <Text style={styles.heroText}>
            {overallMastery >= 80
              ? 'Your collection is looking strong!'
              : overallMastery >= 40
                ? 'You’re building lasting word knowledge.'
                : 'Every review moves these words into memory.'}
          </Text>
        </View>
        <View style={styles.masteryGauge}>
          <View style={styles.masteryGaugeInner}>
            <Ionicons name="school" size={31} color={COLORS.purpleDark} />
            <Text style={styles.masteryGaugeCount}>
              {strongWords}/{words.length}
            </Text>
            <Text style={styles.masteryGaugeLabel}>STRONG</Text>
          </View>
        </View>
      </View>

    <View style={styles.statGrid}>
      <DashboardStat
        icon="time"
        color={COLORS.blue}
        background={COLORS.bluePale}
        value={formatStudyTime(totalSeconds)}
        label="Study time"
      />
      <DashboardStat
        icon="trophy"
        color={COLORS.orange}
        background={COLORS.orangePale}
        value={`${analytics.quizHistory.length}`}
        label="Quizzes"
      />
      <DashboardStat
        icon="close-circle"
        color={COLORS.red}
        background={COLORS.redPale}
        value={`${totalWrong}`}
        label="Missed"
      />
      <DashboardStat
        icon="flame"
        color={COLORS.teal}
        background={COLORS.tealPale}
        value={`${streak}d`}
        label="Streak"
      />
      </View>

      <View style={styles.streakReminderGrid}>
        <View style={styles.streakCard}>
          <View style={styles.streakCardHeader}>
            <View style={styles.streakFlame}>
              <Ionicons name="flame" size={24} color={COLORS.white} />
            </View>
            <View style={styles.streakHeaderCopy}>
              <Text style={styles.streakLabel}>STREAKS</Text>
              <Text style={styles.streakTitle}>{streak} day streak</Text>
            </View>
            <Text style={styles.longestStreak}>
              Best {streakStats.longest}d
            </Text>
          </View>
          <Text style={styles.streakMessage}>
            {getStreakMessage(streakStats)}
          </Text>
          <View style={styles.streakWeek}>
            {streakWeek.map((day) => (
              <StreakDay key={day.key} day={day} />
            ))}
          </View>
        </View>

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
            Get a friendly nudge to review words and protect your streak.
          </Text>
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
                onPress={() =>
                  onUpdateReminder({
                    ...reminderSettings,
                    enabled: true,
                    hour: time.hour,
                    minute: time.minute,
                  })
                }
              />
            ))}
          </View>
        </View>
      </View>

      <DashboardSection
        title="LAST 7 DAYS"
        badge={`${weeklyActivity.reduce((sum, day) => sum + day.value, 0)} activities`}
      >
        <View style={styles.barChart}>
          {weeklyActivity.map((day) => (
            <View key={day.key} style={styles.barColumn}>
              <Text style={styles.barValue}>
                {day.value > 0 ? day.value : ''}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${Math.max(
                        day.value ? 12 : 4,
                        (day.value / maxActivity) * 100,
                      )}%`,
                      backgroundColor:
                        day.key === getDayKey() ? COLORS.green : COLORS.blue,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.barLabel,
                  day.key === getDayKey() && styles.barLabelToday,
                ]}
              >
                {day.label}
              </Text>
            </View>
          ))}
        </View>
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
        </View>
      </DashboardSection>

      <View style={styles.dashboardSplit}>
        <View style={styles.accuracyCard}>
          <Text style={styles.dashboardCardLabel}>QUIZ ACCURACY</Text>
          <View style={styles.accuracyGauge}>
            <View style={styles.accuracyGaugeInner}>
              <Text style={styles.accuracyValue}>{accuracy}%</Text>
              <Text style={styles.accuracyLabel}>CORRECT</Text>
            </View>
          </View>
          <Text style={styles.accuracyDetail}>
            {totalCorrect} right · {totalWrong} missed
          </Text>
        </View>

        <View style={styles.distributionCard}>
          <Text style={styles.dashboardCardLabel}>WORD LEVELS</Text>
          <View style={styles.levelStack}>
            <LevelRow
              color={COLORS.green}
              label="Strong"
              value={strongWords}
            />
            <LevelRow
              color={COLORS.yellow}
              label="Building"
              value={buildingWords}
            />
            <LevelRow
              color={COLORS.blue}
              label="Learning"
              value={learningWords}
            />
          </View>
          <View style={styles.distributionBar}>
            {words.length > 0 && (
              <>
                <View
                  style={{
                    flex: strongWords,
                    backgroundColor: COLORS.green,
                  }}
                />
                <View
                  style={{
                    flex: buildingWords,
                    backgroundColor: COLORS.yellow,
                  }}
                />
                <View
                  style={{
                    flex: learningWords,
                    backgroundColor: COLORS.blue,
                  }}
                />
              </>
            )}
          </View>
        </View>
      </View>

      <DashboardSection title="WORD MASTERY" badge={`${words.length} words`}>
        {mastery.length === 0 ? (
          <Text style={styles.dashboardEmptyText}>
            Add your first word to start measuring mastery.
          </Text>
        ) : (
          mastery.slice(0, 5).map((item) => (
            <View key={item.word.id} style={styles.masteryRow}>
              <View style={styles.masteryRowTop}>
                <Text style={styles.masteryWord}>{item.word.term}</Text>
                <Text
                  style={[
                    styles.masteryPercent,
                    {
                      color:
                        item.score >= 80
                          ? COLORS.greenDark
                          : item.score >= 40
                            ? '#C29100'
                            : COLORS.blue,
                    },
                  ]}
                >
                  {item.score}%
                </Text>
              </View>
              <View style={styles.masteryTrack}>
                <View
                  style={[
                    styles.masteryFill,
                    {
                      width: `${Math.max(item.score, 3)}%`,
                      backgroundColor:
                        item.score >= 80
                          ? COLORS.green
                          : item.score >= 40
                            ? COLORS.yellow
                            : COLORS.blue,
                    },
                  ]}
                />
              </View>
            </View>
          ))
        )}
      </DashboardSection>

      <DashboardSection title="QUIZ TREND" badge="Recent">
        {recentQuizzes.length === 0 ? (
          <Text style={styles.dashboardEmptyText}>
            Complete a daily quiz and your score trend will appear here.
          </Text>
        ) : (
          recentQuizzes.map((attempt) => {
            const percent = attempt.total
              ? Math.round((attempt.score / attempt.total) * 100)
              : 0;
            return (
              <View key={attempt.id} style={styles.trendRow}>
                <Text style={styles.trendDate}>
                  {new Date(`${attempt.date}T12:00:00`).toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric' },
                  )}
                </Text>
                <View style={styles.trendTrack}>
                  <View
                    style={[
                      styles.trendFill,
                      {
                        width: `${percent}%`,
                        backgroundColor:
                          percent >= 80 ? COLORS.green : COLORS.purple,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.trendScore}>{percent}%</Text>
              </View>
            );
          })
        )}
      </DashboardSection>

      <View style={styles.insightCard}>
        <View style={styles.insightIcon}>
          <Ionicons name="sparkles" size={23} color={COLORS.purple} />
        </View>
        <View style={styles.insightCopy}>
          <Text style={styles.insightLabel}>WORDWIZ ESTIMATE</Text>
          <Text style={styles.insightTitle}>
            {remainingReviews === 0 && words.length > 0
              ? 'Your words are in great shape'
              : `${remainingReviews} focused reviews to strong`}
          </Text>
          <Text style={styles.insightText}>
            {words.length === 0
              ? 'Add words and practice them to unlock a learning estimate.'
              : remainingReviews === 0
                ? 'Keep using them naturally to help the meanings last.'
                : `That’s roughly ${Math.max(
                    1,
                    Math.ceil((remainingReviews * 20) / 60),
                  )} more minutes of thoughtful practice.`}
          </Text>
        </View>
      </View>

      <Text style={styles.estimateNote}>
        Mastery is an estimate based on flashcard answers, quiz results, and
        repeated reviews. It is not a scientific assessment.
      </Text>
    </ScrollView>
  );
}

function DashboardStat({
  icon,
  color,
  background,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  background: string;
  value: string;
  label: string;
}) {
  return (
    <View style={[styles.dashboardStat, { backgroundColor: background }]}>
      <View style={[styles.dashboardStatIcon, { backgroundColor: COLORS.white }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={styles.dashboardStatValue}>{value}</Text>
      <Text style={styles.dashboardStatLabel}>{label}</Text>
    </View>
  );
}

function StreakDay({
  day,
}: {
  day: { label: string; active: boolean; today: boolean };
}) {
  return (
    <View style={styles.streakDay}>
      <View
        style={[
          styles.streakDayCircle,
          day.active && styles.streakDayCircleActive,
          day.today && styles.streakDayCircleToday,
        ]}
      >
        <Ionicons
          name={day.active ? 'flame' : 'ellipse'}
          size={day.active ? 16 : 8}
          color={day.active ? COLORS.white : '#C9D2DB'}
        />
      </View>
      <Text style={[styles.streakDayLabel, day.today && styles.streakDayToday]}>
        {day.label}
      </Text>
    </View>
  );
}

function ReminderTimeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.reminderTimeButton,
        active && styles.reminderTimeButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.reminderTimeText,
          active && styles.reminderTimeTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DashboardSection({
  title,
  badge,
  children,
}: {
  title: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.dashboardSection}>
      <View style={styles.dashboardSectionHeader}>
        <Text style={styles.dashboardSectionTitle}>{title}</Text>
        <View style={styles.dashboardBadge}>
          <Text style={styles.dashboardBadgeText}>{badge}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function LevelRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.levelRow}>
      <View style={[styles.levelDot, { backgroundColor: color }]} />
      <Text style={styles.levelLabel}>{label}</Text>
      <Text style={styles.levelValue}>{value}</Text>
    </View>
  );
}

function BottomTabs({
  activeTab,
  bottomInset,
  quizComplete,
  onChange,
}: {
  activeTab: Tab;
  bottomInset: number;
  quizComplete: boolean;
  onChange: (tab: Tab) => void;
}) {
  const tabs: {
    key: Tab;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    activeIcon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
    { key: 'words', label: 'Words', icon: 'book-outline', activeIcon: 'book' },
    {
      key: 'cards',
      label: 'Cards',
      icon: 'albums-outline',
      activeIcon: 'albums',
    },
    {
      key: 'quiz',
      label: 'Quiz',
      icon: 'trophy-outline',
      activeIcon: 'trophy',
    },
    {
      key: 'dashboard',
      label: 'Stats',
      icon: 'bar-chart-outline',
      activeIcon: 'bar-chart',
    },
  ];

  return (
    <View style={[styles.bottomTabs, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            style={styles.tabButton}
          >
            <View style={[styles.tabIcon, active && styles.tabIconActive]}>
              <Ionicons
                name={active ? tab.activeIcon : tab.icon}
                size={24}
                color={active ? COLORS.purpleDark : COLORS.muted}
              />
              {tab.key === 'quiz' && quizComplete && (
                <View style={styles.completeDot}>
                  <Ionicons name="checkmark" size={8} color={COLORS.white} />
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AddWordModal({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (
    term: string,
    definition: string,
    example: string,
    details?: Partial<WordDetails>,
  ) => void;
}) {
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [simpleDefinition, setSimpleDefinition] = useState('');
  const [example, setExample] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [origin, setOrigin] = useState('');
  const [originPeriod, setOriginPeriod] = useState('');
  const [basicInfo, setBasicInfo] = useState('');
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [commonWordsText, setCommonWordsText] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupStatus, setLookupStatus] = useState('');

  function close() {
    setTerm('');
    setDefinition('');
    setSimpleDefinition('');
    setExample('');
    setPartOfSpeech('');
    setPronunciation('');
    setOrigin('');
    setOriginPeriod('');
    setBasicInfo('');
    setSynonyms([]);
    setCommonWordsText('');
    setLookupStatus('');
    onClose();
  }

  async function autoDefine() {
    if (!term.trim()) {
      Alert.alert('Type a word first', 'Enter the word you want WordWiz to define.');
      return;
    }

    setIsLookingUp(true);
    setLookupStatus('');
    try {
      const details = await lookupWordDetails(term);
      setDefinition(details.definition);
      setSimpleDefinition(details.simpleDefinition ?? '');
      setExample(details.example);
      setPartOfSpeech(details.partOfSpeech ?? '');
      setPronunciation(details.pronunciation ?? '');
      setOrigin(details.origin ?? '');
      setOriginPeriod(details.originPeriod ?? '');
      setBasicInfo(details.basicInfo ?? '');
      setSynonyms(details.synonyms ?? []);
      setCommonWordsText((details.commonWords ?? []).join(', '));
      setLookupStatus('Definition found. You can edit anything before saving.');
    } catch {
      setLookupStatus(
        'WordWiz could not find that word. You can still add your own meaning.',
      );
    } finally {
      setIsLookingUp(false);
    }
  }

  function submit() {
    if (!term.trim() || !definition.trim() || !example.trim()) {
      Alert.alert(
        'A little more detail',
        'Add the word, its meaning, and an example sentence.',
      );
      return;
    }
    onAdd(term, definition, example, {
      simpleDefinition,
      partOfSpeech,
      pronunciation,
      origin,
      originPeriod,
      synonyms,
      commonWords: commonWordsText
        .split(',')
        .map((word) => word.trim())
        .filter(Boolean),
      basicInfo,
    });
    setTerm('');
    setDefinition('');
    setSimpleDefinition('');
    setExample('');
    setPartOfSpeech('');
    setPronunciation('');
    setOrigin('');
    setOriginPeriod('');
    setBasicInfo('');
    setSynonyms([]);
    setCommonWordsText('');
    setLookupStatus('');
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.modalSafeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalKeyboard}
        >
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalTopRow}>
              <Pressable onPress={close} style={styles.closeButton}>
                <Ionicons name="close" size={23} color={COLORS.ink} />
              </Pressable>
              <View style={styles.modalStep}>
                <Ionicons name="sparkles" size={16} color={COLORS.purpleDark} />
                <Text style={styles.modalStepText}>NEW DISCOVERY</Text>
              </View>
              <View style={styles.closeButtonPlaceholder} />
            </View>

            <Text style={styles.modalTitle}>Add a word</Text>
            <Text style={styles.modalSubtitle}>
              Writing it in your own words helps it stick.
            </Text>

            <InputGroup
              label="THE WORD"
              icon="text-outline"
              value={term}
              onChangeText={(value) => {
                setTerm(value);
                setLookupStatus('');
              }}
              placeholder="e.g. Serendipity"
              autoCapitalize="words"
            />

            <Pressable
              onPress={autoDefine}
              disabled={isLookingUp}
              style={({ pressed }) => [
                styles.lookupButton,
                isLookingUp && styles.lookupButtonDisabled,
                pressed && !isLookingUp && styles.pressed,
              ]}
            >
              <View style={styles.lookupButtonIcon}>
                <Ionicons
                  name={isLookingUp ? 'hourglass-outline' : 'sparkles'}
                  size={20}
                  color={COLORS.white}
                />
              </View>
              <View style={styles.lookupButtonCopy}>
                <Text style={styles.lookupButtonTitle}>
                  {isLookingUp ? 'Looking it up...' : 'Auto define this word'}
                </Text>
                <Text style={styles.lookupButtonSubtitle}>
                  Fill meaning, sentence, word history, and basic info.
                </Text>
              </View>
            </Pressable>

            {lookupStatus ? (
              <View
                style={[
                  styles.lookupStatus,
                  definition ? styles.lookupStatusSuccess : styles.lookupStatusSoft,
                ]}
              >
                <Ionicons
                  name={definition ? 'checkmark-circle' : 'information-circle'}
                  size={18}
                  color={definition ? COLORS.purpleDark : COLORS.blue}
                />
                <Text style={styles.lookupStatusText}>{lookupStatus}</Text>
              </View>
            ) : null}

            <InputGroup
              label="WHAT IT MEANS"
              icon="bulb-outline"
              value={definition}
              onChangeText={setDefinition}
              placeholder="Full dictionary meaning..."
              multiline
            />
            <InputGroup
              label="VERY SIMPLE DEFINITION"
              icon="happy-outline"
              value={simpleDefinition}
              onChangeText={setSimpleDefinition}
              placeholder="Say it in easy words..."
              multiline
            />
            <InputGroup
              label="COMMON WORDS"
              icon="people-outline"
              value={commonWordsText}
              onChangeText={setCommonWordsText}
              placeholder="easy, simple, plain"
            />
            <InputGroup
              label="USE IT IN A SENTENCE"
              icon="chatbox-ellipses-outline"
              value={example}
              onChangeText={setExample}
              placeholder="I felt serendipity when..."
              multiline
            />

            {(partOfSpeech || pronunciation || synonyms.length > 0 || commonWordsText) && (
              <View style={styles.lookupInfoCard}>
                <View style={styles.lookupInfoHeader}>
                  <Ionicons name="reader-outline" size={19} color={COLORS.blue} />
                  <Text style={styles.lookupInfoTitle}>BASIC WORD INFO</Text>
                </View>
                <View style={styles.infoChipRow}>
                  {partOfSpeech ? (
                    <InfoChip icon="pricetag-outline" text={partOfSpeech} />
                  ) : null}
                  {pronunciation ? (
                    <InfoChip icon="volume-medium-outline" text={pronunciation} />
                  ) : null}
                </View>
                {basicInfo ? (
                  <Text style={styles.lookupInfoText}>{basicInfo}</Text>
                ) : null}
                {synonyms.length > 0 ? (
                  <Text style={styles.lookupInfoText}>
                    Similar words: {synonyms.join(', ')}
                  </Text>
                ) : null}
                {commonWordsText ? (
                  <Text style={styles.lookupInfoText}>
                    Common words: {commonWordsText}
                  </Text>
                ) : null}
              </View>
            )}

            {origin ? (
              <View style={styles.historyCard}>
                <View style={styles.lookupInfoHeader}>
                  <Ionicons name="library-outline" size={19} color={COLORS.purple} />
                  <Text style={styles.historyTitle}>WORD HISTORY</Text>
                </View>
                <View style={styles.historyDetailRow}>
                  <Text style={styles.historyDetailLabel}>WHERE FROM</Text>
                  <Text style={styles.historyText}>{origin}</Text>
                </View>
                <View style={styles.historyDetailRow}>
                  <Text style={styles.historyDetailLabel}>TIME PERIOD</Text>
                  <Text style={styles.historyText}>
                    {originPeriod ||
                      'Time period not available from this dictionary source.'}
                  </Text>
                </View>
              </View>
            ) : null}

            <InputGroup
              label="WORD HISTORY"
              icon="library-outline"
              value={origin}
              onChangeText={(value) => {
                setOrigin(value);
                if (!originPeriod) setOriginPeriod(inferOriginPeriod(value));
              }}
              placeholder="Where the word came from..."
              multiline
            />
            <InputGroup
              label="TIME PERIOD"
              icon="time-outline"
              value={originPeriod}
              onChangeText={setOriginPeriod}
              placeholder="e.g. Old English, 1600s, unknown..."
            />

            <View style={styles.memoryTip}>
              <View style={styles.memoryTipIcon}>
                <Ionicons name="heart" size={18} color={COLORS.purple} />
              </View>
              <Text style={styles.memoryTipText}>
                Make the example personal or funny. Your brain remembers
                meaningful moments best.
              </Text>
            </View>

            <Pressable
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>SAVE TO MY WORDS</Text>
              <Ionicons name="checkmark" size={22} color={COLORS.white} />
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function InputGroup({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  autoCapitalize = 'sentences',
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View style={styles.inputGroup}>
      <View style={styles.inputLabelRow}>
        <Ionicons name={icon} size={17} color={COLORS.purpleDark} />
        <Text style={styles.inputLabel}>{label}</Text>
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#A7B0BD"
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundAura: {
    ...StyleSheet.absoluteFill,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  backgroundBlobTop: {
    position: 'absolute',
    top: -95,
    right: -85,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#DCEBFF',
    opacity: 0.9,
  },
  backgroundBlobMiddle: {
    position: 'absolute',
    top: 245,
    left: -120,
    width: 265,
    height: 265,
    borderRadius: 133,
    backgroundColor: '#FFE5EE',
    opacity: 0.78,
  },
  backgroundBlobBottom: {
    position: 'absolute',
    right: -105,
    bottom: 95,
    width: 245,
    height: 245,
    borderRadius: 123,
    backgroundColor: '#E8FBF4',
    opacity: 0.72,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  screen: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  logoBadge: {
    width: 66,
    height: 66,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.purple,
    ...FLOATING_SHADOW,
  },
  loadingTitle: {
    marginTop: 18,
    color: COLORS.ink,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  singleScreenContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 42,
  },
  homeContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  homeHero: {
    minHeight: 365,
    marginTop: 8,
    borderRadius: 38,
    overflow: 'hidden',
    backgroundColor: '#DDE9FF',
    ...FLOATING_SHADOW,
  },
  heroCloudOne: {
    position: 'absolute',
    width: 215,
    height: 215,
    borderRadius: 108,
    left: -58,
    top: 36,
    backgroundColor: '#FFF0DC',
    opacity: 0.9,
  },
  heroCloudTwo: {
    position: 'absolute',
    width: 225,
    height: 225,
    borderRadius: 113,
    right: -76,
    top: -20,
    backgroundColor: '#E8FBF4',
    opacity: 0.8,
  },
  heroCloudThree: {
    position: 'absolute',
    width: 310,
    height: 180,
    borderRadius: 90,
    left: 10,
    bottom: -28,
    backgroundColor: '#FFF9F5',
    opacity: 0.92,
  },
  homeTopRow: {
    padding: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatarBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  avatarText: {
    color: COLORS.purpleDark,
    fontSize: 24,
    fontWeight: '900',
  },
  homeStatsPill: {
    paddingHorizontal: 11,
    height: 34,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  homeStatsPillText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  paperPlane: {
    position: 'absolute',
    top: 135,
    alignSelf: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.48)',
    transform: [{ rotate: '-12deg' }],
  },
  heroGreeting: {
    position: 'absolute',
    left: 22,
    right: 22,
    bottom: 47,
    alignItems: 'center',
  },
  homeTitle: {
    color: '#111827',
    textAlign: 'center',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -1,
  },
  homeSubtitle: {
    marginTop: 7,
    color: COLORS.ink,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
  homeOverviewCard: {
    marginTop: -33,
    marginHorizontal: 17,
    padding: 18,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SOFT_SHADOW,
    zIndex: 2,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeSectionTitle: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  overviewProgressRing: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.teal,
    backgroundColor: COLORS.tealPale,
  },
  overviewProgressText: {
    color: COLORS.teal,
    fontSize: 12,
    fontWeight: '900',
  },
  homeIdeaGrid: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 10,
  },
  homeMiniCard: {
    flex: 1,
    minHeight: 82,
    padding: 12,
    borderRadius: 16,
  },
  homeMiniIcon: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  homeMiniTitle: {
    marginTop: 9,
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  homeMiniSubtitle: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  homeDottedLine: {
    marginTop: 15,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D7DEE8',
  },
  homePrimaryButton: {
    marginTop: 13,
    height: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.blue,
    ...FLOATING_SHADOW,
  },
  homePrimaryButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
  },
  homeSkillCard: {
    marginTop: 17,
    padding: 17,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.tealPale,
    ...SOFT_SHADOW,
  },
  homeSkillCopy: {
    paddingRight: 78,
  },
  homeSkillTitle: {
    color: COLORS.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  homeSkillSubtitle: {
    marginTop: 4,
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  homeSkillTrack: {
    height: 7,
    marginTop: 14,
    marginRight: 68,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#EDE8F7',
  },
  homeSkillFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.teal,
  },
  homeStartButton: {
    position: 'absolute',
    right: 17,
    top: 28,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.blue,
    backgroundColor: COLORS.bluePale,
  },
  homeStartButtonText: {
    color: COLORS.blue,
    fontSize: 12,
    fontWeight: '900',
  },
  homePromptSection: {
    marginTop: 22,
  },
  nextActionRow: {
    marginTop: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  homeActionButton: {
    flex: 1,
    minHeight: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SOFT_SHADOW,
  },
  homeActionLabel: {
    marginTop: 7,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  nextWordsCard: {
    marginTop: 17,
    padding: 17,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  nextWordRow: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextWordIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.orangePale,
  },
  nextWordInitial: {
    color: COLORS.orange,
    fontSize: 18,
    fontWeight: '900',
  },
  nextWordCopy: {
    flex: 1,
    marginLeft: 12,
  },
  nextWordTerm: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  nextWordDefinition: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  nextWordMastery: {
    color: COLORS.blue,
    fontSize: 12,
    fontWeight: '900',
  },
  homeReminderStrip: {
    marginTop: 15,
    padding: 14,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: COLORS.bluePale,
    borderWidth: 1,
    borderColor: '#DDE8FF',
  },
  homeReminderText: {
    flex: 1,
    color: '#5268C9',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  header: {
    paddingTop: 8,
    paddingBottom: 18,
  },
  screenHeaderCard: {
    minHeight: 218,
    padding: 18,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#D9E3FF',
    ...FLOATING_SHADOW,
  },
  screenHeaderCloudOne: {
    position: 'absolute',
    top: -38,
    right: -52,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: '#FFE4EC',
    opacity: 0.8,
  },
  screenHeaderCloudTwo: {
    position: 'absolute',
    left: -58,
    bottom: 16,
    width: 190,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#FFF3E8',
    opacity: 0.86,
  },
  screenHeaderCloudThree: {
    position: 'absolute',
    right: 18,
    bottom: -38,
    width: 220,
    height: 118,
    borderRadius: 59,
    backgroundColor: '#FFF9F7',
    opacity: 0.92,
  },
  screenHeaderPlane: {
    position: 'absolute',
    top: 84,
    right: 35,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.48)',
    transform: [{ rotate: '-14deg' }],
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  miniLogo: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.purple,
  },
  brandName: {
    marginLeft: 9,
    color: COLORS.purpleDark,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  eyebrow: {
    marginBottom: 7,
    color: COLORS.purpleDark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  screenTitle: {
    color: COLORS.ink,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  screenSubtitle: {
    marginTop: 7,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  headerTextCard: {
    marginTop: 'auto',
    padding: 17,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
  },
  progressCard: {
    minHeight: 82,
    padding: 15,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.tealPale,
    ...SOFT_SHADOW,
  },
  progressIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  progressCopy: {
    flex: 1,
    marginLeft: 13,
  },
  progressNumber: {
    color: COLORS.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  progressLabel: {
    marginTop: 2,
    color: COLORS.purpleDark,
    fontSize: 12,
    fontWeight: '700',
  },
  studyButton: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.purple,
    ...SOFT_SHADOW,
  },
  studyButtonText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  addButton: {
    marginTop: 16,
    minHeight: 82,
    paddingHorizontal: 17,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.teal,
    ...FLOATING_SHADOW,
  },
  addIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  addButtonCopy: {
    flex: 1,
    marginLeft: 13,
  },
  addButtonTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: '900',
  },
  addButtonSubtitle: {
    marginTop: 3,
    color: '#EAF6FF',
    fontSize: 12,
    fontWeight: '600',
  },
  listToolbar: {
    marginTop: 27,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  segmentedControl: {
    padding: 3,
    borderRadius: 11,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sortButton: {
    width: 35,
    height: 29,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  wordRow: {
    minHeight: 82,
    marginBottom: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  letterBadge: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: {
    fontSize: 22,
    fontWeight: '900',
  },
  wordRowCopy: {
    flex: 1,
    marginHorizontal: 13,
  },
  wordTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  wordTerm: {
    color: COLORS.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  partOfSpeechPill: {
    maxWidth: 92,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
    color: COLORS.purpleDark,
    backgroundColor: COLORS.purplePale,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  wordDefinition: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  commonWordsLine: {
    marginTop: 4,
    color: COLORS.purpleDark,
    fontSize: 11,
    fontWeight: '800',
  },
  wordMeta: {
    marginTop: 3,
    color: COLORS.blue,
    fontSize: 11,
    fontWeight: '700',
  },
  reviewCount: {
    minWidth: 31,
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: COLORS.bluePale,
  },
  reviewText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 76,
    height: 76,
    marginBottom: 16,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.purplePale,
  },
  emptyTitle: {
    color: COLORS.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyText: {
    maxWidth: 270,
    marginTop: 6,
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  cardScreenContent: {
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  cardProgressRow: {
    marginBottom: 17,
  },
  cardProgressText: {
    marginBottom: 8,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  progressTrack: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#EDE8F7',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: COLORS.teal,
  },
  flashcard: {
    minHeight: 390,
    padding: 22,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 31,
    backgroundColor: '#FFFBF3',
    ...FLOATING_SHADOW,
  },
  flashcardRevealed: {
    borderColor: '#FFE0B7',
    backgroundColor: '#FFF7EA',
  },
  flashcardPressed: {
    transform: [{ scale: 0.99 }],
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLabel: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: COLORS.bluePale,
  },
  cardLabelRevealed: {
    backgroundColor: COLORS.yellowPale,
  },
  cardLabelText: {
    color: COLORS.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cardLabelTextRevealed: {
    color: '#C59600',
  },
  flashcardBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashcardWord: {
    color: COLORS.ink,
    textAlign: 'center',
    fontSize: 38,
    lineHeight: 45,
    fontWeight: '900',
    letterSpacing: -1.3,
  },
  flashcardMetaRow: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  flashcardMetaPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
    color: COLORS.purpleDark,
    backgroundColor: COLORS.purplePale,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  flashcardPronunciation: {
    color: COLORS.blue,
    fontSize: 13,
    fontWeight: '800',
  },
  flashcardDefinition: {
    maxWidth: 300,
    marginTop: 20,
    color: COLORS.ink,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
  },
  fullDefinitionText: {
    maxWidth: 310,
    marginTop: 10,
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  wordInfoPanel: {
    width: '100%',
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F0FAFF',
    borderWidth: 1,
    borderColor: '#DCE7FF',
  },
  infoChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  infoChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.white,
  },
  infoChipText: {
    color: COLORS.purpleDark,
    fontSize: 11,
    fontWeight: '900',
  },
  wordInfoText: {
    marginTop: 10,
    color: '#5268C9',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  commonWordsBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#DCE7FF',
  },
  commonWordsTitle: {
    marginBottom: 8,
    color: COLORS.blue,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  commonWordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  commonWordChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    overflow: 'hidden',
    color: COLORS.purpleDark,
    backgroundColor: COLORS.white,
    fontSize: 11,
    fontWeight: '900',
  },
  originBox: {
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: '#DCE7FF',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  originCopy: {
    flex: 1,
  },
  originLabel: {
    marginBottom: 3,
    color: COLORS.blue,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  originText: {
    marginBottom: 8,
    color: '#5268C9',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  tapHint: {
    marginTop: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tapHintText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  exampleBox: {
    width: '100%',
    marginTop: 25,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.orangePale,
  },
  exampleText: {
    flex: 1,
    color: '#9A5F18',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  cardActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 12,
  },
  answerButton: {
    flex: 1,
    height: 55,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderBottomWidth: 4,
  },
  againButton: {
    borderWidth: 2,
    borderColor: '#FFD7D7',
    borderBottomWidth: 4,
    backgroundColor: COLORS.redPale,
    ...SOFT_SHADOW,
  },
  gotItButton: {
    borderBottomColor: COLORS.purpleDark,
    backgroundColor: COLORS.purple,
    ...SOFT_SHADOW,
  },
  answerButtonText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  cardTip: {
    marginTop: 19,
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
  },
  quizContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  quizIntroCard: {
    padding: 23,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 30,
    alignItems: 'center',
    backgroundColor: '#FFF8EC',
    ...FLOATING_SHADOW,
  },
  quizIllustration: {
    width: 118,
    height: 118,
    marginBottom: 17,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1D6',
  },
  sparkleOne: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  sparkleTwo: {
    position: 'absolute',
    bottom: 17,
    left: 15,
  },
  quizIntroTitle: {
    color: COLORS.ink,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  quizIntroText: {
    marginTop: 9,
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  quizFacts: {
    width: '100%',
    marginVertical: 22,
    padding: 14,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: COLORS.bluePale,
    borderWidth: 1,
    borderColor: '#DCE7FF',
  },
  quizFact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quizFactText: {
    color: '#5268C9',
    fontSize: 12,
    fontWeight: '800',
  },
  primaryButton: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 21,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: COLORS.blue,
    ...FLOATING_SHADOW,
  },
  primaryButtonPressed: {
    transform: [{ translateY: 3 }],
    borderBottomWidth: 2,
  },
  primaryButtonDisabled: {
    backgroundColor: '#CFC8DF',
    boxShadow: 'none',
    elevation: 0,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  quizProgressTrack: {
    height: 10,
    marginBottom: 20,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#EDE8F7',
  },
  quizProgressFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: COLORS.orange,
  },
  questionCard: {
    minHeight: 150,
    marginBottom: 18,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#FFE0B7',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.orangePale,
    ...SOFT_SHADOW,
  },
  questionPrompt: {
    color: COLORS.orange,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  questionWord: {
    marginTop: 12,
    color: COLORS.ink,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  optionsList: {
    gap: 10,
  },
  optionButton: {
    minHeight: 66,
    padding: 11,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  optionCorrect: {
    borderColor: COLORS.green,
    backgroundColor: COLORS.greenPale,
  },
  optionWrong: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.redPale,
  },
  optionLetter: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bluePale,
  },
  optionLetterCorrect: {
    backgroundColor: COLORS.green,
  },
  optionLetterWrong: {
    backgroundColor: COLORS.red,
  },
  optionLetterText: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  optionText: {
    flex: 1,
    marginLeft: 12,
    color: COLORS.ink,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
  },
  feedbackBox: {
    marginVertical: 15,
    padding: 14,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  feedbackCorrect: {
    backgroundColor: COLORS.greenPale,
  },
  feedbackWrong: {
    backgroundColor: COLORS.redPale,
  },
  feedbackCopy: {
    flex: 1,
  },
  feedbackTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  feedbackText: {
    marginTop: 2,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  completeCard: {
    marginTop: 12,
    padding: 27,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 31,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    ...FLOATING_SHADOW,
  },
  completeBadge: {
    width: 82,
    height: 82,
    marginBottom: 18,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.teal,
    ...SOFT_SHADOW,
  },
  completeTitle: {
    color: COLORS.ink,
    fontSize: 23,
    fontWeight: '900',
  },
  completeScore: {
    marginTop: 13,
    color: COLORS.teal,
    fontSize: 43,
    fontWeight: '900',
  },
  completeTotal: {
    color: COLORS.muted,
    fontSize: 24,
  },
  completeText: {
    maxWidth: 290,
    marginTop: 9,
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  comeBackPill: {
    marginTop: 23,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.yellowPale,
  },
  comeBackText: {
    color: '#9A7800',
    fontSize: 12,
    fontWeight: '800',
  },
  emptyPractice: {
    marginTop: 20,
    padding: 28,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 30,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  emptyPracticeIcon: {
    width: 92,
    height: 92,
    marginBottom: 18,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bluePale,
  },
  emptyPracticeTitle: {
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: '900',
  },
  emptyPracticeText: {
    marginTop: 7,
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  dashboardContent: {
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  dashboardHero: {
    minHeight: 176,
    padding: 21,
    borderRadius: 31,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.blue,
    ...FLOATING_SHADOW,
  },
  heroCopy: {
    flex: 1,
    paddingRight: 14,
  },
  heroLabel: {
    color: '#E9E4FF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  heroValue: {
    marginTop: 5,
    color: COLORS.white,
    fontSize: 43,
    lineHeight: 49,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  heroText: {
    marginTop: 5,
    color: '#F1EEFF',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  masteryGauge: {
    width: 106,
    height: 106,
    padding: 8,
    borderRadius: 53,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  masteryGaugeInner: {
    flex: 1,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  masteryGaugeCount: {
    marginTop: 2,
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  masteryGaugeLabel: {
    color: COLORS.muted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  statGrid: {
    marginTop: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  dashboardStat: {
    width: '48.5%',
    minHeight: 91,
    padding: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  dashboardStatIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardStatValue: {
    position: 'absolute',
    top: 14,
    right: 14,
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  dashboardStatLabel: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  streakReminderGrid: {
    marginTop: 15,
    gap: 12,
  },
  streakCard: {
    padding: 17,
    borderWidth: 1.5,
    borderColor: '#FFE8C4',
    borderRadius: 26,
    backgroundColor: COLORS.orangePale,
    ...SOFT_SHADOW,
  },
  streakCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  streakFlame: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.yellow,
    ...SOFT_SHADOW,
  },
  streakHeaderCopy: {
    flex: 1,
    marginLeft: 12,
  },
  streakLabel: {
    color: '#9A7800',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  streakTitle: {
    marginTop: 2,
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  longestStreak: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    overflow: 'hidden',
    color: '#9A7800',
    backgroundColor: COLORS.white,
    fontSize: 11,
    fontWeight: '900',
  },
  streakMessage: {
    marginTop: 13,
    color: '#9A7800',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  streakWeek: {
    marginTop: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streakDay: {
    alignItems: 'center',
  },
  streakDayCircle: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  streakDayCircleActive: {
    backgroundColor: COLORS.yellow,
  },
  streakDayCircleToday: {
    borderWidth: 2,
    borderColor: COLORS.green,
  },
  streakDayLabel: {
    marginTop: 6,
    color: '#9A7800',
    fontSize: 10,
    fontWeight: '800',
  },
  streakDayToday: {
    color: COLORS.purpleDark,
  },
  reminderCard: {
    padding: 17,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 26,
    backgroundColor: COLORS.bluePale,
    ...SOFT_SHADOW,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bluePale,
  },
  reminderHeaderCopy: {
    flex: 1,
    marginLeft: 12,
  },
  reminderLabel: {
    color: COLORS.blue,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  reminderTitle: {
    marginTop: 2,
    color: COLORS.ink,
    fontSize: 19,
    fontWeight: '900',
  },
  reminderSwitch: {
    width: 50,
    height: 30,
    padding: 4,
    borderRadius: 15,
    justifyContent: 'center',
    backgroundColor: '#E3DEEE',
  },
  reminderSwitchOn: {
    backgroundColor: COLORS.teal,
  },
  reminderSwitchKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.white,
  },
  reminderSwitchKnobOn: {
    alignSelf: 'flex-end',
  },
  reminderText: {
    marginTop: 12,
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  reminderTimes: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
  },
  reminderTimeButton: {
    flex: 1,
    height: 38,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  reminderTimeButtonActive: {
    borderColor: COLORS.blue,
    backgroundColor: COLORS.white,
  },
  reminderTimeText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  reminderTimeTextActive: {
    color: COLORS.blue,
  },
  dashboardSection: {
    marginTop: 15,
    padding: 18,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 25,
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
  },
  dashboardSectionHeader: {
    marginBottom: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dashboardSectionTitle: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  dashboardBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: COLORS.bluePale,
  },
  dashboardBadgeText: {
    color: COLORS.blue,
    fontSize: 9,
    fontWeight: '900',
  },
  barChart: {
    height: 145,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  barColumn: {
    width: '11%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barValue: {
    height: 17,
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '800',
  },
  barTrack: {
    width: 22,
    height: 101,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: '#EFEAF8',
  },
  barFill: {
    width: '100%',
    minHeight: 4,
    borderRadius: 8,
  },
  barLabel: {
    marginTop: 7,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  barLabelToday: {
    color: COLORS.purpleDark,
  },
  chartLegendRow: {
    marginTop: 13,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 18,
  },
  chartLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartLegendText: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  dashboardSplit: {
    marginTop: 15,
    flexDirection: 'row',
    gap: 10,
  },
  accuracyCard: {
    flex: 1,
    minHeight: 218,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: COLORS.purplePale,
    ...SOFT_SHADOW,
  },
  distributionCard: {
    flex: 1,
    minHeight: 218,
    padding: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 24,
    backgroundColor: COLORS.tealPale,
    ...SOFT_SHADOW,
  },
  dashboardCardLabel: {
    alignSelf: 'flex-start',
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  accuracyGauge: {
    width: 112,
    height: 112,
    marginTop: 17,
    padding: 9,
    borderWidth: 7,
    borderColor: COLORS.purple,
    borderRadius: 56,
    backgroundColor: COLORS.purplePale,
  },
  accuracyGaugeInner: {
    flex: 1,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  accuracyValue: {
    color: COLORS.ink,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  accuracyLabel: {
    color: COLORS.purpleDark,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  accuracyDetail: {
    marginTop: 12,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  levelStack: {
    marginTop: 23,
    gap: 14,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  levelLabel: {
    flex: 1,
    marginLeft: 7,
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  levelValue: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  distributionBar: {
    height: 12,
    marginTop: 22,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#EFEAF8',
  },
  masteryRow: {
    marginBottom: 15,
  },
  masteryRowTop: {
    marginBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  masteryWord: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  masteryPercent: {
    fontSize: 11,
    fontWeight: '900',
  },
  masteryTrack: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#EFEAF8',
  },
  masteryFill: {
    height: '100%',
    borderRadius: 5,
  },
  trendRow: {
    marginBottom: 13,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendDate: {
    width: 48,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  trendTrack: {
    flex: 1,
    height: 11,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#EFEAF8',
  },
  trendFill: {
    height: '100%',
    borderRadius: 6,
  },
  trendScore: {
    width: 40,
    color: COLORS.ink,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '900',
  },
  dashboardEmptyText: {
    paddingVertical: 13,
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  insightCard: {
    marginTop: 15,
    padding: 17,
    borderWidth: 1.5,
    borderColor: '#E3DAFF',
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.orangePale,
    ...SOFT_SHADOW,
  },
  insightIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  insightCopy: {
    flex: 1,
    marginLeft: 12,
  },
  insightLabel: {
    color: COLORS.purple,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  insightTitle: {
    marginTop: 3,
    color: COLORS.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  insightText: {
    marginTop: 4,
    color: '#6E619C',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  estimateNote: {
    marginTop: 14,
    paddingHorizontal: 9,
    color: COLORS.muted,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '500',
  },
  bottomTabs: {
    marginHorizontal: 18,
    marginBottom: 10,
    paddingTop: 9,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,226,245,0.86)',
    borderRadius: 28,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,251,255,0.94)',
    boxShadow: '0 14px 35px rgba(90, 84, 145, 0.16)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabIcon: {
    width: 43,
    height: 34,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: COLORS.tealPale,
  },
  tabLabel: {
    marginTop: 3,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  tabLabelActive: {
    color: COLORS.teal,
  },
  completeDot: {
    position: 'absolute',
    top: 2,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.teal,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalKeyboard: {
    flex: 1,
  },
  modalContent: {
    paddingHorizontal: 22,
    paddingBottom: 35,
  },
  modalTopRow: {
    paddingTop: 8,
    marginBottom: 19,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    ...SOFT_SHADOW,
  },
  closeButtonPlaceholder: {
    width: 40,
  },
  modalStep: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.tealPale,
  },
  modalStepText: {
    color: COLORS.teal,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  modalTitle: {
    color: COLORS.ink,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -1,
  },
  modalSubtitle: {
    marginTop: 6,
    marginBottom: 25,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  inputGroup: {
    marginBottom: 19,
  },
  inputLabelRow: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  inputLabel: {
    color: COLORS.ink,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  input: {
    minHeight: 55,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 19,
    color: COLORS.ink,
    backgroundColor: COLORS.surface,
    ...SOFT_SHADOW,
    fontSize: 16,
    fontWeight: '600',
  },
  inputMultiline: {
    minHeight: 93,
    paddingTop: 15,
    textAlignVertical: 'top',
  },
  lookupButton: {
    minHeight: 72,
    marginBottom: 17,
    padding: 13,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.blue,
    ...FLOATING_SHADOW,
  },
  lookupButtonDisabled: {
    opacity: 0.72,
  },
  lookupButtonIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  lookupButtonCopy: {
    flex: 1,
    marginLeft: 12,
  },
  lookupButtonTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '900',
  },
  lookupButtonSubtitle: {
    marginTop: 3,
    color: '#EAF6FF',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  lookupStatus: {
    marginTop: -5,
    marginBottom: 17,
    padding: 12,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  lookupStatusSuccess: {
    backgroundColor: COLORS.greenPale,
    borderWidth: 1,
    borderColor: '#D8F5E9',
  },
  lookupStatusSoft: {
    backgroundColor: COLORS.bluePale,
    borderWidth: 1,
    borderColor: '#DCE7FF',
  },
  lookupStatusText: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  lookupInfoCard: {
    marginBottom: 18,
    padding: 15,
    borderWidth: 1.5,
    borderColor: '#DCE7FF',
    borderRadius: 22,
    backgroundColor: '#F0FAFF',
    ...SOFT_SHADOW,
  },
  lookupInfoHeader: {
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  lookupInfoTitle: {
    color: '#5268C9',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  lookupInfoText: {
    marginTop: 10,
    color: '#5268C9',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  historyCard: {
    marginTop: -2,
    marginBottom: 18,
    padding: 15,
    borderWidth: 1.5,
    borderColor: '#E3DAFF',
    borderRadius: 22,
    backgroundColor: COLORS.orangePale,
    ...SOFT_SHADOW,
  },
  historyTitle: {
    color: COLORS.purple,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  historyDetailRow: {
    marginTop: 8,
  },
  historyDetailLabel: {
    marginBottom: 4,
    color: COLORS.purple,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  historyText: {
    color: '#6E619C',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  memoryTip: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.purplePale,
    borderWidth: 1,
    borderColor: '#E4DCFF',
  },
  memoryTipIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
  },
  memoryTipText: {
    flex: 1,
    color: '#5E4D9C',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
});
