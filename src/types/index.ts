export type Tab = 'home' | 'words' | 'cards' | 'quiz' | 'dashboard';
export type SortMode = 'alphabetical' | 'recent';
export type LegalPage = 'terms' | 'privacy';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type StoredUser = AuthUser & {
  passwordHash: string;
  passwordSalt: string;
  password?: string;
};

export type Word = {
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

export type WordDetails = Pick<
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

export type DictionaryDefinition = {
  definition?: string;
  example?: string;
  synonyms?: string[];
};

export type DictionaryMeaning = {
  partOfSpeech?: string;
  definitions?: DictionaryDefinition[];
  synonyms?: string[];
};

export type DictionaryEntry = {
  word?: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  origin?: string;
  meanings?: DictionaryMeaning[];
};

export type QuizProgress = {
  date: string;
  score: number;
  total: number;
};

export type QuizAnswer = {
  wordId: string;
  correct: boolean;
};

export type QuizAttempt = QuizProgress & {
  id: string;
  completedAt: string;
  durationSeconds: number;
  answers: QuizAnswer[];
};

export type QuizQuestionMode =
  | 'word-to-definition'
  | 'definition-to-word'
  | 'true-false';

export type QuizQuestion = {
  word: Word;
  prompt: string;
  displayText: string;
  answer: string;
  options: string[];
  mode: QuizQuestionMode;
  helperText: string;
  feedback: string;
};

export type CardStudyEvent = {
  id: string;
  wordId: string;
  date: string;
  studiedAt: string;
  remembered: boolean;
  durationSeconds: number;
};

export type AnalyticsData = {
  quizHistory: QuizAttempt[];
  cardHistory: CardStudyEvent[];
};

export type ReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  notificationId?: string;
};

export type StreakStats = {
  current: number;
  longest: number;
  todayDone: boolean;
  activeDates: Set<string>;
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  color: string;
  background: string;
  unlocked: boolean;
  progress: number;
  target: number;
};
