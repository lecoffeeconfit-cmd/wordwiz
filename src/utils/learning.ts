import type {
  AnalyticsData,
  QuizAnswer,
  QuizAttempt,
  QuizProgress,
  StreakStats,
  Word,
  WordDetails,
} from '../types';
import { getDayKey, getPreviousDayKey, getRecentDays } from './date';

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

  return {
    id: existingWord?.id ?? id,
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
    createdAt: existingWord?.createdAt ?? createdAt,
    reviews: existingWord?.reviews ?? 0,
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
      createdAt: first.createdAt < second.createdAt ? first.createdAt : second.createdAt,
    };
  }

  return {
    ...first,
    reviews: Math.max(first.reviews, second.reviews),
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

export function applyQuizReviews(words: Word[], answers: QuizAnswer[]) {
  const reviewedWordIds = new Set(answers.map((answer) => answer.wordId));

  return words.map((word) =>
    reviewedWordIds.has(word.id)
      ? { ...word, reviews: word.reviews + 1 }
      : word,
  );
}

export function addQuizAttempt(analytics: AnalyticsData, attempt: QuizAttempt) {
  return {
    ...analytics,
    quizHistory: [attempt, ...analytics.quizHistory].slice(0, 30),
  };
}

export function getWordMastery(
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
