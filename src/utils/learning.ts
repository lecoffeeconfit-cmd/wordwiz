import type {
  Achievement,
  AnalyticsData,
  QuizAnswer,
  QuizAttempt,
  QuizQuestionDifficulty,
  QuizProgress,
  StreakStats,
  Word,
  WordDetails,
  WordMasteryProgress,
} from '../types';
import { getDayKey, getDayKeyForDate, getPreviousDayKey, getRecentDays } from './date';
import { makeDistinctSimpleDefinition } from './dictionary';

export const NOVICE_MASTERY_COLOR = '#89CFF0';

export function getProgressColor(score: number) {
  if (score >= 100) return '#F4B400';
  if (score >= 80) return '#39C69A';
  if (score >= 40) return '#8E78FF';
  return '#3E9BDA';
}

export function getHeroProgressColor(score: number) {
  if (score >= 90) return '#F4B400';
  if (score >= 75) return '#FFD87A';
  if (score >= 50) return '#8DE7C7';
  if (score < 15) return NOVICE_MASTERY_COLOR;
  return '#B9F5E0';
}

export function getProgressPaleColor(score: number) {
  if (score >= 100) return '#FFF7DF';
  if (score >= 80) return '#E8FBF4';
  if (score >= 40) return '#F2EFFF';
  return '#EAF2FF';
}

export type WordMasteryCategoryId =
  | 'all'
  | 'learning'
  | 'building'
  | 'strong'
  | 'master';

export type WordMasteryCategory = {
  id: WordMasteryCategoryId;
  label: string;
  shortLabel: string;
  color: string;
  pale: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
};

export const WORD_MASTERY_CATEGORIES: WordMasteryCategory[] = [
  {
    id: 'all',
    label: 'All words',
    shortLabel: 'All',
    color: '#5B4DE4',
    pale: '#F2EFFF',
    icon: 'apps',
  },
  {
    id: 'learning',
    label: 'Learning words',
    shortLabel: 'Learning',
    color: '#2879E8',
    pale: '#EAF2FF',
    icon: 'leaf',
  },
  {
    id: 'building',
    label: 'Building words',
    shortLabel: 'Building',
    color: '#FFD87A',
    pale: '#FFF7DF',
    icon: 'construct',
  },
  {
    id: 'strong',
    label: 'Strong words',
    shortLabel: 'Strong',
    color: '#8E78FF',
    pale: '#F2EFFF',
    icon: 'flash',
  },
  {
    id: 'master',
    label: 'Proficient words',
    shortLabel: 'Proficient',
    color: '#2AA987',
    pale: '#E8FBF4',
    icon: 'sparkles',
  },
];

export function getWordMasteryCategoryId(score: number): WordMasteryCategoryId {
  if (score >= 100) return 'master';
  if (score >= 80) return 'strong';
  if (score >= 40) return 'building';
  return 'learning';
}

export function getWordMasteryCategory(score: number) {
  const categoryId = getWordMasteryCategoryId(score);

  return (
    WORD_MASTERY_CATEGORIES.find((category) => category.id === categoryId) ??
    WORD_MASTERY_CATEGORIES[1]
  );
}

export function getWordMasteryCategoryForWord(
  word: Word,
  analytics: AnalyticsData,
) {
  const progress = getWordMasteryProgress(word, analytics);
  if (progress.masteryPercent >= 100 || isWordMastered(progress)) {
    return WORD_MASTERY_CATEGORIES.find((category) => category.id === 'master') ??
      WORD_MASTERY_CATEGORIES[4];
  }

  if (progress.masteryPercent >= 70) {
    return WORD_MASTERY_CATEGORIES.find((category) => category.id === 'strong') ??
      WORD_MASTERY_CATEGORIES[3];
  }
  if (progress.masteryPercent >= 50) {
    return WORD_MASTERY_CATEGORIES.find((category) => category.id === 'building') ??
      WORD_MASTERY_CATEGORIES[2];
  }
  return WORD_MASTERY_CATEGORIES[1];
}

export function sortWordsAlphabetically(words: Word[]) {
  return [...words].sort((first, second) =>
    first.term.localeCompare(second.term, undefined, {
      sensitivity: 'base',
    }),
  );
}

export function buildWordFromInput({
  existingWord,
  term,
  definition,
  example,
  details = {},
  id,
  createdAt,
}: {
  existingWord?: Word;
  term: string;
  definition: string;
  example: string;
  details?: Partial<WordDetails>;
  id: string;
  createdAt: string;
}): Word {
  const cleanTerm = formatSavedWordTerm(term);
  const cleanDefinition = definition.trim();

  return {
    id: existingWord?.id ?? id,
    term: cleanTerm,
    definition: cleanDefinition,
    simpleDefinition: makeDistinctSimpleDefinition(
      details.simpleDefinition,
      cleanDefinition,
      cleanTerm,
    ),
    example: example.trim(),
    partOfSpeech: details.partOfSpeech?.trim(),
    pronunciation: details.pronunciation?.trim(),
    origin: details.origin?.trim(),
    originPeriod: details.originPeriod?.trim(),
    synonyms: details.synonyms ?? [],
    antonyms: details.antonyms ?? [],
    commonWords: details.commonWords ?? [],
    basicInfo: details.basicInfo?.trim(),
    wordnik_definitions: details.wordnik_definitions,
    wordnik_examples: details.wordnik_examples,
    wordnik_pronunciations: details.wordnik_pronunciations,
    wordnik_etymology: details.wordnik_etymology,
    wordnik_related_words: details.wordnik_related_words,
    wordnik_antonyms: details.wordnik_antonyms,
    wordnik_syllables: details.wordnik_syllables,
    wordnik_attribution: details.wordnik_attribution,
    wordnik_url: details.wordnik_url,
    createdAt: existingWord?.createdAt ?? createdAt,
    reviews: existingWord?.reviews ?? 0,
    mastery: existingWord ? existingWord.mastery : createWordMasteryProgress(),
  };
}

export function formatSavedWordTerm(term: string) {
  const cleanTerm = term.trim().replace(/\s+/g, ' ');
  if (!cleanTerm) {
    return cleanTerm;
  }

  if (cleanTerm === cleanTerm.toUpperCase() && /[A-Z]/.test(cleanTerm)) {
    return cleanTerm;
  }

  return cleanTerm.charAt(0).toUpperCase() + cleanTerm.slice(1);
}

export function upsertSavedWord(words: Word[], savedWord: Word) {
  const existingWord = words.find(
    (word) => word.term.toLowerCase() === savedWord.term.toLowerCase(),
  );

  if (existingWord) {
    return words.map((word) =>
      word.id === existingWord.id ? { ...savedWord, id: existingWord.id } : word,
    );
  }

  return [savedWord, ...words];
}

export function mergeWordLists(primaryWords: Word[], secondaryWords: Word[]) {
  const merged = [...primaryWords];

  secondaryWords.forEach((word) => {
    const existingIndex = merged.findIndex(
      (item) =>
        item.id === word.id ||
        item.term.trim().toLowerCase() === word.term.trim().toLowerCase(),
    );

    if (existingIndex < 0) {
      merged.push(word);
      return;
    }

    const existing = merged[existingIndex];
    merged[existingIndex] = chooseMoreCompleteWord(existing, word);
  });

  return merged.sort((first, second) =>
    second.createdAt.localeCompare(first.createdAt),
  );
}

function chooseMoreCompleteWord(first: Word, second: Word) {
  const firstScore = getWordCompletenessScore(first);
  const secondScore = getWordCompletenessScore(second);

  if (secondScore > firstScore) {
    return {
      ...second,
      reviews: Math.max(first.reviews, second.reviews),
      mastery: second.mastery ?? first.mastery,
      createdAt: first.createdAt < second.createdAt ? first.createdAt : second.createdAt,
    };
  }

  return {
    ...first,
    reviews: Math.max(first.reviews, second.reviews),
    mastery: first.mastery ?? second.mastery,
    createdAt: first.createdAt < second.createdAt ? first.createdAt : second.createdAt,
  };
}

function getWordCompletenessScore(word: Word) {
  return [
    word.definition,
    word.simpleDefinition,
    word.example,
    word.partOfSpeech,
    word.pronunciation,
    word.origin,
    word.originPeriod,
    word.basicInfo,
    ...(word.synonyms ?? []),
    ...(word.antonyms ?? []),
    ...(word.commonWords ?? []),
  ].filter((value) => Boolean(value?.trim())).length;
}

export function buildQuizCompletion({
  score,
  total,
  durationSeconds,
  answers,
  completedAt,
  id,
  date = getDayKey(),
}: {
  score: number;
  total: number;
  durationSeconds: number;
  answers: QuizAnswer[];
  completedAt: string;
  id: string;
  date?: string;
}) {
  const progress: QuizProgress = {
    date,
    score,
    total,
  };
  const attempt: QuizAttempt = {
    ...progress,
    id,
    completedAt,
    durationSeconds,
    answers,
  };

  return { progress, attempt };
}

export function applyQuizReviews(
  words: Word[],
  answers: QuizAnswer[],
  analytics: AnalyticsData = { quizHistory: [], cardHistory: [] },
) {
  return applyQuizMastery(words, answers, analytics);
}

export function addQuizAttempt(analytics: AnalyticsData, attempt: QuizAttempt) {
  return {
    ...analytics,
    quizHistory: [attempt, ...analytics.quizHistory].slice(0, 30),
  };
}

/**
 * The first completed quiz for a calendar day is the day's daily quiz. Any
 * later attempts are optional practice rounds. This derives the label from
 * the history so it works for attempts saved before quiz types were shown.
 */
export function getQuizAttemptKind(
  attempt: QuizAttempt,
  attempts: QuizAttempt[],
): 'daily' | 'practice' {
  const firstAttemptOfDay = attempts
    .filter((candidate) => candidate.date === attempt.date)
    .sort(
      (first, second) =>
        first.completedAt.localeCompare(second.completedAt) ||
        first.id.localeCompare(second.id),
    )[0];

  return firstAttemptOfDay?.id === attempt.id ? 'daily' : 'practice';
}

export function createWordMasteryProgress(): WordMasteryProgress {
  return {
    masteryPercent: 0,
    totalCorrect: 0,
    totalIncorrect: 0,
    correctStreak: 0,
    successfulReviewDays: [],
    recentResults: [],
  };
}

export function getWordMasteryProgress(
  word: Word,
  analytics: AnalyticsData,
): WordMasteryProgress {
  if (word.mastery) {
    return normalizeMasteryProgress(word.mastery);
  }

  return buildLegacyMasteryProgress(word, analytics);
}

export function isWordMastered(progress: WordMasteryProgress) {
  const recentResults = progress.recentResults.slice(-10);
  const recentIncorrect = recentResults.filter((result) => !result.correct).length;

  return (
    progress.masteryPercent >= 85 &&
    progress.totalCorrect >= 6 &&
    progress.successfulReviewDays.length >= 3 &&
    getDifficultyRank(progress.highestQuestionDifficultyCompleted) >= 3 &&
    recentResults.at(-1)?.correct === true &&
    recentIncorrect <= 2
  );
}

export function applyQuizMastery(
  words: Word[],
  answers: QuizAnswer[],
  analytics: AnalyticsData,
): Word[] {
  const answersByWordId = new Map(
    answers.map((answer) => [answer.wordId, answer]),
  );

  return words.map((word) => {
    const answer = answersByWordId.get(word.id);
    if (!answer) return word;

    const reviewedAt = toSafeDate(answer.answeredAt);
    const current = getWordMasteryProgress(word, analytics);
    const mastery = updateMasteryFromQuizAnswer(current, answer, reviewedAt);

    return {
      ...word,
      reviews: word.reviews + 1,
      mastery,
    };
  });
}

export function applyFlashcardReview(
  words: Word[],
  wordId: string,
  remembered: boolean,
  analytics: AnalyticsData,
  reviewedAt = new Date(),
): Word[] {
  return words.map((word) => {
    if (word.id !== wordId) return word;

    const current = getWordMasteryProgress(word, analytics);
    const nextReviewAt = new Date(reviewedAt);
    nextReviewAt.setHours(nextReviewAt.getHours() + (remembered ? 24 : 4));

    return {
      ...word,
      reviews: word.reviews + 1,
      mastery: {
        ...current,
        lastReviewedAt: reviewedAt.toISOString(),
        nextReviewAt: nextReviewAt.toISOString(),
      },
    };
  });
}

export function getWordMastery(
  word: Word,
  analytics: AnalyticsData,
) {
  return getWordMasteryProgress(word, analytics).masteryPercent;
}

function buildLegacyMasteryProgress(
  word: Word,
  analytics: AnalyticsData,
): WordMasteryProgress {
  const cardEvents = analytics.cardHistory.filter(
    (event) => event.wordId === word.id,
  );
  const quizAnswers = analytics.quizHistory
    .flatMap((attempt) =>
      attempt.answers
        .filter((answer) => answer.wordId === word.id)
        .map((answer) => ({ answer, attempt })),
    )
    .reverse();
  const cardScore = cardEvents.reduce(
    (total, event) => total + (event.remembered ? 10 : -4),
    0,
  );
  const quizScore = quizAnswers.reduce(
    (total, item) => total + (item.answer.correct ? 14 : -6),
    0,
  );
  const recentResults = quizAnswers.slice(-10).map(({ answer, attempt }) => ({
    correct: answer.correct,
    difficulty: answer.difficulty ?? 'multiple-choice',
    answeredAt: answer.answeredAt ?? attempt.completedAt,
  }));
  const successfulReviewDays = Array.from(
    new Set(
      quizAnswers
        .filter(({ answer }) => answer.correct)
        .map(({ attempt }) => attempt.date),
    ),
  );
  const lastCorrect = [...recentResults].reverse().find((result) => result.correct);
  let correctStreak = 0;
  for (const result of [...recentResults].reverse()) {
    if (!result.correct) break;
    correctStreak += 1;
  }

  return {
    masteryPercent: clampMasteryPercent(word.reviews * 12 + cardScore + quizScore),
    totalCorrect: quizAnswers.filter(({ answer }) => answer.correct).length,
    totalIncorrect: quizAnswers.filter(({ answer }) => !answer.correct).length,
    correctStreak,
    lastReviewedAt: recentResults.at(-1)?.answeredAt ?? cardEvents[0]?.studiedAt,
    lastCorrectAt: lastCorrect?.answeredAt,
    firstLearnedAt: recentResults.find((result) => result.correct)?.answeredAt,
    successfulReviewDays,
    highestQuestionDifficultyCompleted: recentResults.some(
      (result) => result.correct,
    )
      ? 'multiple-choice'
      : undefined,
    recentResults,
  };
}

function normalizeMasteryProgress(progress: WordMasteryProgress): WordMasteryProgress {
  return {
    ...createWordMasteryProgress(),
    ...progress,
    masteryPercent: clampMasteryPercent(progress.masteryPercent),
    totalCorrect: Math.max(0, progress.totalCorrect ?? 0),
    totalIncorrect: Math.max(0, progress.totalIncorrect ?? 0),
    correctStreak: Math.max(0, progress.correctStreak ?? 0),
    successfulReviewDays: Array.from(new Set(progress.successfulReviewDays ?? [])),
    recentResults: (progress.recentResults ?? []).slice(-10),
  };
}

function updateMasteryFromQuizAnswer(
  progress: WordMasteryProgress,
  answer: QuizAnswer,
  reviewedAt: Date,
): WordMasteryProgress {
  const current = normalizeMasteryProgress(progress);
  const difficulty = answer.difficulty ?? 'multiple-choice';
  const reviewedAtIso = reviewedAt.toISOString();
  const sameSession = isWithinHours(current.lastReviewedAt, reviewedAt, 4);
  const correctInSession = current.recentResults.filter(
    (result) =>
      result.correct && isWithinHours(result.answeredAt, reviewedAt, 4),
  ).length;
  const retentionBonus = answer.correct && !sameSession
    ? getRetentionBonus(current.lastCorrectAt, reviewedAt)
    : 0;
  const baseChange = answer.correct
    ? getCorrectMasteryChange(difficulty)
    : -getIncorrectMasteryChange(difficulty);
  const earnedChange =
    answer.correct && sameSession && correctInSession >= 2
      ? Math.min(1, getCorrectMasteryChange(difficulty))
      : baseChange + retentionBonus;
  const recentResults = [
    ...current.recentResults,
    { correct: answer.correct, difficulty, answeredAt: reviewedAtIso },
  ].slice(-10);
  const successfulReviewDays = answer.correct
    ? Array.from(new Set([...current.successfulReviewDays, getDayKeyForDate(reviewedAt)]))
    : current.successfulReviewDays;
  const nextMasteryPercent = clampMasteryPercent(
    current.masteryPercent + earnedChange,
  );

  return {
    ...current,
    masteryPercent: nextMasteryPercent,
    totalCorrect: current.totalCorrect + (answer.correct ? 1 : 0),
    totalIncorrect: current.totalIncorrect + (answer.correct ? 0 : 1),
    correctStreak: answer.correct ? current.correctStreak + 1 : 0,
    lastReviewedAt: reviewedAtIso,
    lastCorrectAt: answer.correct ? reviewedAtIso : current.lastCorrectAt,
    firstLearnedAt:
      answer.correct && !current.firstLearnedAt
        ? reviewedAtIso
        : current.firstLearnedAt,
    successfulReviewDays,
    highestQuestionDifficultyCompleted:
      answer.correct &&
      getDifficultyRank(difficulty) >
        getDifficultyRank(current.highestQuestionDifficultyCompleted)
        ? difficulty
        : current.highestQuestionDifficultyCompleted,
    recentResults,
    nextReviewAt: getNextReviewAt(nextMasteryPercent, answer.correct, reviewedAt, retentionBonus),
  };
}

function getCorrectMasteryChange(difficulty: QuizQuestionDifficulty) {
  return {
    recognition: 3,
    'multiple-choice': 5,
    'fill-in-options': 7,
    'typed-recall': 10,
  }[difficulty];
}

function getIncorrectMasteryChange(difficulty: QuizQuestionDifficulty) {
  return {
    recognition: 6,
    'multiple-choice': 8,
    'fill-in-options': 10,
    'typed-recall': 12,
  }[difficulty];
}

function getRetentionBonus(lastCorrectAt: string | undefined, reviewedAt: Date) {
  if (!lastCorrectAt) return 0;
  const elapsedHours = (reviewedAt.getTime() - new Date(lastCorrectAt).getTime()) / 3_600_000;
  if (elapsedHours >= 24 * 7) return 7;
  if (elapsedHours >= 24 * 3) return 5;
  if (elapsedHours >= 24) return 3;
  return 0;
}

function getNextReviewAt(
  masteryPercent: number,
  correct: boolean,
  reviewedAt: Date,
  retentionBonus: number,
) {
  const nextReviewAt = new Date(reviewedAt);
  if (!correct) {
    nextReviewAt.setHours(nextReviewAt.getHours() + 4);
    return nextReviewAt.toISOString();
  }

  const baseDays = masteryPercent < 30 ? 1 : masteryPercent < 60 ? 2 : masteryPercent < 80 ? 4 : 7;
  nextReviewAt.setDate(nextReviewAt.getDate() + baseDays + (retentionBonus >= 5 ? 1 : 0));
  return nextReviewAt.toISOString();
}

function isWithinHours(value: string | undefined, now: Date, hours: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && now.getTime() - time < hours * 3_600_000;
}

function getDifficultyRank(difficulty: QuizQuestionDifficulty | undefined) {
  if (difficulty === 'typed-recall') return 4;
  if (difficulty === 'fill-in-options') return 3;
  if (difficulty === 'multiple-choice') return 2;
  return difficulty === 'recognition' ? 1 : 0;
}

function clampMasteryPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toSafeDate(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export const MASTERY_LEVELS = [
  {
    title: 'Novice WordWiz',
    shortTitle: 'Novice',
    minScore: 0,
    color: NOVICE_MASTERY_COLOR,
    encouragement: 'Start with a few honest reviews.',
  },
  {
    title: 'Apprentice WordWiz',
    shortTitle: 'Apprentice',
    minScore: 15,
    color: '#39C69A',
    encouragement: 'Your words are beginning to stick.',
  },
  {
    title: 'Journeyman WordWiz',
    shortTitle: 'Journeyman',
    minScore: 30,
    color: '#8DE7C7',
    encouragement: 'Steady practice is building recall.',
  },
  {
    title: 'Adept WordWiz',
    shortTitle: 'Adept',
    minScore: 45,
    color: '#FFD87A',
    encouragement: 'You are turning recognition into command.',
  },
  {
    title: 'Mage WordWiz',
    shortTitle: 'Mage',
    minScore: 60,
    color: '#8E78FF',
    encouragement: 'Your vocabulary magic is getting reliable.',
  },
  {
    title: 'Master WordWiz',
    shortTitle: 'Master',
    minScore: 75,
    color: '#F2A65A',
    encouragement: 'Most saved words are becoming familiar.',
  },
  {
    title: 'Grandmaster WordWiz',
    shortTitle: 'Grandmaster',
    minScore: 90,
    color: '#FF7E9F',
    encouragement: 'This collection is deeply practiced.',
  },
] as const;

export function getMasteryLevel(score: number) {
  const normalizedScore = clampMasteryScore(score);

  return MASTERY_LEVELS.reduce(
    (currentLevel, level) =>
      normalizedScore >= level.minScore ? level : currentLevel,
    MASTERY_LEVELS[0],
  );
}

export function getNextMasteryLevel(score: number) {
  const normalizedScore = clampMasteryScore(score);

  return (
    MASTERY_LEVELS.find((level) => level.minScore > normalizedScore) ?? null
  );
}

export function getMasteryLevelProgress(score: number) {
  const normalizedScore = clampMasteryScore(score);
  const currentLevel = getMasteryLevel(normalizedScore);
  const nextLevel = getNextMasteryLevel(normalizedScore);

  if (!nextLevel) {
    return 100;
  }

  const span = nextLevel.minScore - currentLevel.minScore;

  return Math.round(
    ((normalizedScore - currentLevel.minScore) / span) * 100,
  );
}

function clampMasteryScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getWordReviewPriority(word: Word, analytics: AnalyticsData) {
  const cardEvents = analytics.cardHistory.filter(
    (event) => event.wordId === word.id,
  );
  const quizAnswers = analytics.quizHistory.flatMap((attempt) =>
    attempt.answers.filter((answer) => answer.wordId === word.id),
  );
  const misses = quizAnswers.filter((answer) => !answer.correct).length;
  const remembered = cardEvents.filter((event) => event.remembered).length;
  const forgot = cardEvents.filter((event) => !event.remembered).length;
  const progress = getWordMasteryProgress(word, analytics);
  const mastery = progress.masteryPercent;
  const createdAt = new Date(word.createdAt).getTime();
  const ageHours = Number.isFinite(createdAt)
    ? Math.max(0, (Date.now() - createdAt) / 3_600_000)
    : 24;
  const newWordBoost = word.reviews === 0 ? Math.max(0, 20 - ageHours) : 0;
  const lowReviewBoost = Math.max(0, 3 - word.reviews) * 4;
  const nextReviewTime = progress.nextReviewAt
    ? new Date(progress.nextReviewAt).getTime()
    : Number.NaN;
  const dueReviewBoost = Number.isFinite(nextReviewTime) && nextReviewTime <= Date.now()
    ? 24
    : 0;
  const lastReviewedTime = progress.lastReviewedAt
    ? new Date(progress.lastReviewedAt).getTime()
    : Number.NaN;
  const retentionCheckBoost = Number.isFinite(lastReviewedTime)
    ? Math.min(20, Math.max(0, (Date.now() - lastReviewedTime) / 86_400_000) * 2)
    : 0;

  return (
    misses * 28 +
    forgot * 22 -
    remembered * 5 +
    newWordBoost +
    lowReviewBoost +
    dueReviewBoost +
    retentionCheckBoost +
    Math.max(0, 80 - mastery)
  );
}

export function sortWordsForReview(words: Word[], analytics: AnalyticsData) {
  return [...words].sort(
    (first, second) =>
      getQuizMissCount(second, analytics) - getQuizMissCount(first, analytics) ||
      getForgotCardCount(second, analytics) - getForgotCardCount(first, analytics) ||
      getWordReviewPriority(second, analytics) -
        getWordReviewPriority(first, analytics) ||
      second.createdAt.localeCompare(first.createdAt),
  );
}

function getQuizMissCount(word: Word, analytics: AnalyticsData) {
  return analytics.quizHistory
    .flatMap((attempt) => attempt.answers)
    .filter((answer) => answer.wordId === word.id && !answer.correct).length;
}

function getForgotCardCount(word: Word, analytics: AnalyticsData) {
  return analytics.cardHistory.filter(
    (event) => event.wordId === word.id && !event.remembered,
  ).length;
}

export function formatStudyTime(seconds: number) {
  if (seconds < 60) return seconds === 0 ? '0m' : '<1m';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function getActivityDates(analytics: AnalyticsData) {
  return new Set([
    ...analytics.cardHistory.map((event) => event.date),
    ...analytics.quizHistory.map((attempt) => attempt.date),
  ]);
}

export function countBackwardsStreak(activeDates: Set<string>, startDay: string) {
  let streak = 0;
  let cursor = startDay;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = getPreviousDayKey(cursor);
  }
  return streak;
}

export function calculateStreakStats(analytics: AnalyticsData): StreakStats {
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


export function calculateStreak(analytics: AnalyticsData) {
  return calculateStreakStats(analytics).current;
}

export function getStreakWeek(stats: StreakStats) {
  return getRecentDays(7).map((day) => ({
    ...day,
    active: stats.activeDates.has(day.key),
    today: day.key === getDayKey(),
  }));
}

export function getStreakMessage(stats: StreakStats) {
  if (stats.todayDone) {
    return 'Nice. Your streak is safe for today.';
  }
  if (stats.current > 0) {
    return 'Review today to keep your streak alive.';
  }
  return 'Start a new streak with one quick review today.';
}

export function getStreakMilestone(stats: StreakStats) {
  const streak = stats.current;

  if (streak >= 30) {
    return {
      title: '30-day scholar',
      description: 'A serious word habit is alive.',
      color: '#F2A65A',
    };
  }
  if (streak >= 14) {
    return {
      title: '14-day word habit',
      description: 'Two steady weeks of learning.',
      color: '#8E78FF',
    };
  }
  if (streak >= 7) {
    return {
      title: '7-day rhythm',
      description: 'A full week of practice.',
      color: '#39C69A',
    };
  }
  if (streak >= 3) {
    return {
      title: '3-day spark',
      description: 'The habit is starting to catch.',
      color: '#2879E8',
    };
  }

  return {
    title: 'Start the spark',
    description: 'Reach 3 active days for your first streak badge.',
    color: '#7A83A5',
  };
}

export function buildAchievements({
  words,
  analytics,
  streakStats = calculateStreakStats(analytics),
}: {
  words: Word[];
  analytics: AnalyticsData;
  streakStats?: StreakStats;
}): Achievement[] {
  const totalCardReviews = analytics.cardHistory.length;
  const rememberedCards = analytics.cardHistory.filter(
    (event) => event.remembered,
  ).length;
  const perfectQuiz = analytics.quizHistory.some(
    (attempt) => attempt.total > 0 && attempt.score === attempt.total,
  );
  const perfectQuizCount = analytics.quizHistory.filter(
    (attempt) => attempt.total > 0 && attempt.score === attempt.total,
  ).length;
  const quizzesByDay = analytics.quizHistory.reduce<Record<string, number>>(
    (counts, attempt) => ({
      ...counts,
      [attempt.date]: (counts[attempt.date] ?? 0) + 1,
    }),
    {},
  );
  const mostQuizzesInOneDay = Math.max(0, ...Object.values(quizzesByDay));
  const totalQuizQuestions = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.total,
    0,
  );
  const strongWords = words.filter(
    (word) => getWordMastery(word, analytics) >= 80,
  ).length;
  const topWordReviews = Math.max(0, ...words.map((word) => word.reviews));
  const totalReviews = totalCardReviews + totalQuizQuestions;
  const nextReviewHorizon = getNextReviewHorizon(totalReviews);

  return [
    createAchievement({
      id: 'first-word',
      title: 'First word saved',
      description: 'Your collection has begun.',
      icon: 'book',
      color: '#2879E8',
      background: '#EAF2FF',
      progress: words.length,
      target: 1,
    }),
    createAchievement({
      id: 'word-collector',
      title: '10-word collection',
      description: 'A real vocabulary shelf.',
      icon: 'albums',
      color: '#8E78FF',
      background: '#F2EFFF',
      progress: words.length,
      target: 10,
    }),
    createAchievement({
      id: 'first-quiz',
      title: 'First quiz complete',
      description: 'You tested your recall.',
      icon: 'trophy',
      color: '#F2A65A',
      background: '#FFF0DC',
      progress: analytics.quizHistory.length,
      target: 1,
    }),
    createAchievement({
      id: 'perfect-quiz',
      title: 'Perfect quiz',
      description: 'Every answer landed.',
      icon: 'sparkles',
      color: '#FF7E9F',
      background: '#FFEAF1',
      progress: perfectQuiz ? 1 : 0,
      target: 1,
    }),
    createAchievement({
      id: 'review-50',
      title: '50 reviews',
      description: 'Practice is doing its work.',
      icon: 'refresh-circle',
      color: '#39C69A',
      background: '#E8FBF4',
      progress: totalReviews,
      target: 50,
    }),
    createAchievement({
      id: 'word-loop',
      title: 'Word loop',
      description: 'Reviewed one word 5 times.',
      icon: 'repeat',
      color: '#2879E8',
      background: '#EAF2FF',
      progress: topWordReviews,
      target: 5,
    }),
    createAchievement({
      id: 'strong-five',
      title: '5 strong words',
      description: 'Meanings are sticking.',
      icon: 'school',
      color: '#8DE7C7',
      background: '#EFFFF8',
      progress: strongWords,
      target: 5,
    }),
    createAchievement({
      id: 'streak-week',
      title: '7-day rhythm',
      description: 'A full week of word practice.',
      icon: 'flame',
      color: '#F2A65A',
      background: '#FFF0DC',
      progress: streakStats.longest,
      target: 7,
    }),
    createAchievement({
      id: 'remembered-10',
      title: '10 confident cards',
      description: 'You marked them remembered.',
      icon: 'checkmark-circle',
      color: '#39C69A',
      background: '#E8FBF4',
      progress: rememberedCards,
      target: 10,
    }),
    createAchievement({
      id: 'quiz-day-3',
      title: 'Triple quiz day',
      description: 'Complete 3 practice quizzes in one day.',
      icon: 'flash',
      color: '#2879E8',
      background: '#EAF2FF',
      progress: mostQuizzesInOneDay,
      target: 3,
    }),
    createAchievement({
      id: 'quiz-day-5',
      title: 'Quiz marathon',
      description: 'Complete 5 practice quizzes in one day.',
      icon: 'ribbon',
      color: '#8E78FF',
      background: '#F2EFFF',
      progress: mostQuizzesInOneDay,
      target: 5,
    }),
    createAchievement({
      id: 'quiz-10',
      title: '10 quizzes complete',
      description: 'Your recall routine is taking shape.',
      icon: 'trophy',
      color: '#F2A65A',
      background: '#FFF0DC',
      progress: analytics.quizHistory.length,
      target: 10,
    }),
    createAchievement({
      id: 'perfect-5',
      title: '5 perfect quizzes',
      description: 'Accuracy and recall are working together.',
      icon: 'sparkles',
      color: '#FF7E9F',
      background: '#FFEAF1',
      progress: perfectQuizCount,
      target: 5,
    }),
    createAchievement({
      id: 'collector-25',
      title: '25-word collection',
      description: 'Your vocabulary shelf keeps growing.',
      icon: 'library',
      color: '#8E78FF',
      background: '#F2EFFF',
      progress: words.length,
      target: 25,
    }),
    createAchievement({
      id: 'strong-25',
      title: '25 strong words',
      description: 'A dependable vocabulary foundation.',
      icon: 'school',
      color: '#2AA987',
      background: '#EFFFF8',
      progress: strongWords,
      target: 25,
    }),
    createAchievement({
      id: 'streak-14',
      title: '14-day rhythm',
      description: 'Two full weeks of consistent practice.',
      icon: 'flame',
      color: '#F2A65A',
      background: '#FFF0DC',
      progress: streakStats.longest,
      target: 14,
    }),
    createAchievement({
      id: 'streak-30',
      title: '30-day momentum',
      description: 'A month-long vocabulary habit.',
      icon: 'medal',
      color: '#FF7E9F',
      background: '#FFEAF1',
      progress: streakStats.longest,
      target: 30,
    }),
    createAchievement({
      id: 'remembered-100',
      title: '100 confident cards',
      description: 'You have built serious recall strength.',
      icon: 'checkmark-done-circle',
      color: '#39C69A',
      background: '#E8FBF4',
      progress: rememberedCards,
      target: 100,
    }),
    createAchievement({
      id: 'review-100',
      title: '100 reviews',
      description: 'Consistent practice is becoming a habit.',
      icon: 'refresh-circle',
      color: '#39C69A',
      background: '#E8FBF4',
      progress: totalReviews,
      target: 100,
    }),
    createAchievement({
      id: 'review-250',
      title: '250 reviews',
      description: 'Repeated recall is building durable memory.',
      icon: 'sync-circle',
      color: '#2879E8',
      background: '#EAF2FF',
      progress: totalReviews,
      target: 250,
    }),
    createAchievement({
      id: 'review-500',
      title: '500 reviews',
      description: 'A major vocabulary practice milestone.',
      icon: 'diamond',
      color: '#8E78FF',
      background: '#F2EFFF',
      progress: totalReviews,
      target: 500,
    }),
    createAchievement({
      id: `review-horizon-${nextReviewHorizon}`,
      title: `${nextReviewHorizon} review horizon`,
      description: 'A harder practice milestone is always ahead.',
      icon: 'rocket',
      color: '#5B4DE4',
      background: '#F2EFFF',
      progress: totalReviews,
      target: nextReviewHorizon,
    }),
  ];
}

function getNextReviewHorizon(totalReviews: number) {
  return Math.max(1000, (Math.floor(totalReviews / 500) + 1) * 500);
}

function createAchievement({
  id,
  title,
  description,
  icon,
  color,
  background,
  progress,
  target,
}: Omit<Achievement, 'unlocked'>): Achievement {
  return {
    id,
    title,
    description,
    icon,
    color,
    background,
    progress: Math.min(progress, target),
    target,
    unlocked: progress >= target,
  };
}
