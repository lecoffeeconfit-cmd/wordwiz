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

export type QuizQuestionDifficulty =
  | 'recognition'
  | 'multiple-choice'
  | 'fill-in-options'
  | 'typed-recall';

export type MasteryResult = {
  correct: boolean;
  difficulty: QuizQuestionDifficulty;
  answeredAt: string;
};

export type WordMasteryProgress = {
  masteryPercent: number;
  totalCorrect: number;
  totalIncorrect: number;
  correctStreak: number;
  lastReviewedAt?: string;
  lastCorrectAt?: string;
  firstLearnedAt?: string;
  successfulReviewDays: string[];
  highestQuestionDifficultyCompleted?: QuizQuestionDifficulty;
  recentResults: MasteryResult[];
  nextReviewAt?: string;
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
  antonyms?: string[];
  commonWords?: string[];
  basicInfo?: string;
  wordnik_definitions?: WordnikDefinition[];
  wordnik_examples?: string[];
  wordnik_pronunciations?: string[];
  wordnik_etymology?: string[];
  wordnik_related_words?: string[];
  wordnik_antonyms?: string[];
  wordnik_syllables?: string[];
  wordnik_attribution?: string[];
  wordnik_url?: string;
  createdAt: string;
  reviews: number;
  mastery?: WordMasteryProgress;
};

export type WordnikDefinition = {
  text: string;
  partOfSpeech?: string;
  attributionText?: string;
};

export type DefinitionOption = {
  text: string;
  source: string;
  partOfSpeech?: string;
  recommended: boolean;
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
  | 'antonyms'
  | 'commonWords'
  | 'basicInfo'
  | 'wordnik_definitions'
  | 'wordnik_examples'
  | 'wordnik_pronunciations'
  | 'wordnik_etymology'
  | 'wordnik_related_words'
  | 'wordnik_antonyms'
  | 'wordnik_syllables'
  | 'wordnik_attribution'
  | 'wordnik_url'
> & {
  definitionOptions?: DefinitionOption[];
};

export type DictionaryDefinition = {
  definition?: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
};

export type DictionaryMeaning = {
  partOfSpeech?: string;
  definitions?: DictionaryDefinition[];
  synonyms?: string[];
  antonyms?: string[];
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
  difficulty?: QuizQuestionDifficulty;
  answeredAt?: string;
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
  | 'true-false'
  | 'typed-word';

export type QuizQuestion = {
  word: Word;
  prompt: string;
  displayText: string;
  answer: string;
  options: string[];
  mode: QuizQuestionMode;
  difficulty: QuizQuestionDifficulty;
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
  notificationIds?: string[];
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
