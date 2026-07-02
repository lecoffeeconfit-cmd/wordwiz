import type {
  Achievement,
  AnalyticsData,
  QuizAnswer,
  QuizAttempt,
  QuizProgress,
  StreakStats,
  Word,
  WordDetails,
} from '../types';
import { getDayKey, getPreviousDayKey, getRecentDays } from './date';

export function getProgressColor(score: number) {
  if (score >= 90) return '#F4B400';
  if (score >= 75) return '#F2A65A';
  if (score >= 60) return '#8E78FF';
  if (score >= 40) return '#FFD87A';
  if (score >= 20) return '#39C69A';
  return '#2879E8';
}

export function getProgressPaleColor(score: number) {
  if (score >= 90) return '#FFF7DF';
  if (score >= 75) return '#FFF0DC';
  if (score >= 60) return '#F2EFFF';
  if (score >= 40) return '#FFF7DF';
  if (score >= 20) return '#E8FBF4';
  return '#EAF2FF';
}

export function getProgressShineOpacity(score: number) {
  const normalizedScore = Math.max(0, Math.min(100, score));
  if (normalizedScore < 50) {
    return 0;
  }
  if (normalizedScore >= 100) {
    return 0.58;
  }

  return Number((0.14 + ((normalizedScore - 50) / 50) * 0.32).toFixed(2));
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

export const MASTERY_LEVELS = [
  {
    title: 'Novice WordWiz',
    shortTitle: 'Novice',
    minScore: 0,
    color: '#2879E8',
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
  const mastery = getWordMastery(word, analytics);
  const createdAt = new Date(word.createdAt).getTime();
  const ageHours = Number.isFinite(createdAt)
    ? Math.max(0, (Date.now() - createdAt) / 3_600_000)
    : 24;
  const newWordBoost = word.reviews === 0 ? Math.max(0, 20 - ageHours) : 0;
  const lowReviewBoost = Math.max(0, 3 - word.reviews) * 4;

  return (
    misses * 28 +
    forgot * 22 -
    remembered * 5 +
    newWordBoost +
    lowReviewBoost +
    Math.max(0, 80 - mastery)
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
  const totalQuizQuestions = analytics.quizHistory.reduce(
    (total, attempt) => total + attempt.total,
    0,
  );
  const strongWords = words.filter(
    (word) => getWordMastery(word, analytics) >= 80,
  ).length;
  const topWordReviews = Math.max(0, ...words.map((word) => word.reviews));
  const totalReviews = totalCardReviews + totalQuizQuestions;

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
  ];
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
