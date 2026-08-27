import type { AnalyticsData, Word } from '../types';
import {
  calculateStreakStats,
  deterministicShuffle,
  getCompetitiveRetention,
  getDailyLearningProgress,
  getDayKeyForDate,
  getDueReviewWords,
  getWordMastery,
  sortWordsForReview,
} from '../utils';
import type {
  WordWizWidgetConfig,
  WordWizWidgetWord,
  WordWizWidgetSnapshot,
} from './types';

function getSourceWords(
  words: Word[],
  analytics: AnalyticsData,
  source: WordWizWidgetConfig['source'],
  asOf: Date,
) {
  const sourceWords = source === 'flagged'
    ? words.filter((word) => word.isFlagged)
    : source === 'weak'
      ? [...words].sort((first, second) =>
          getWordMastery(first, analytics) - getWordMastery(second, analytics),
        )
      : words;
  const availableWords = sourceWords.filter((word) => !word.mastery?.excludedFromPractice);

  if (source === 'random') {
    return deterministicShuffle(availableWords, `${getDayKeyForDate(asOf)}:widget:random`);
  }

  const dueWords = getDueReviewWords(availableWords, analytics, asOf).map((item) => item.word);
  const prioritizedWords = source === 'weak'
    ? availableWords
    : sortWordsForReview(availableWords, analytics);
  const seen = new Set<string>();

  return [...dueWords, ...prioritizedWords].filter((word) => {
    if (seen.has(word.id)) return false;
    seen.add(word.id);
    return true;
  });
}

function getWordOfTheDay(words: Word[], asOf: Date) {
  return deterministicShuffle(words, `${getDayKeyForDate(asOf)}:widget:word-of-the-day`)[0];
}

function getWidgetWord(word: Word | undefined): WordWizWidgetWord {
  return {
    id: word?.id ?? '',
    term: word?.term ?? 'serendipity',
    definition: word?.definition ?? 'A fortunate discovery made by chance.',
    plainDefinition: word?.simpleDefinition ?? word?.definition ?? 'A fortunate discovery made by chance.',
    example: word?.example ?? '',
    partOfSpeech: word?.partOfSpeech ?? '',
    pronunciation: word?.pronunciation ?? '',
    synonyms: Array.from(new Set([...(word?.synonyms ?? []), ...(word?.commonWords ?? []), ...(word?.wordnik_related_words ?? [])]))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 3),
    antonyms: Array.from(new Set([...(word?.antonyms ?? []), ...(word?.wordnik_antonyms ?? [])]))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2),
  };
}

export function buildWordWizWidgetSnapshot(
  config: WordWizWidgetConfig,
  words: Word[],
  analytics: AnalyticsData,
  dailyLearningGoal: number,
  asOf = new Date(),
  rotationIndex = 0,
): WordWizWidgetSnapshot {
  const availableWords = words.filter((word) => !word.mastery?.excludedFromPractice);
  const selectedWords = config.widgetType === 'word-of-the-day' || config.widgetType === 'daily-challenge'
    ? [getWordOfTheDay(availableWords, asOf)]
    : getSourceWords(availableWords, analytics, config.source, asOf);
  const rotationWords = selectedWords.slice(0, 5).map(getWidgetWord);
  const safeRotationWords = rotationWords.length > 0 ? rotationWords : [getWidgetWord(undefined)];
  const currentWord = safeRotationWords[Math.min(rotationIndex, safeRotationWords.length - 1)] ?? safeRotationWords[0];
  const streak = calculateStreakStats(analytics, dailyLearningGoal);
  const learningToday = getDailyLearningProgress(analytics, getDayKeyForDate(asOf));
  const dueCount = getDueReviewWords(availableWords, analytics, asOf).length;
  const retention = getCompetitiveRetention(analytics);

  return {
    widgetType: config.widgetType,
    size: config.size,
    style: config.style,
    currentWord,
    rotationWords: safeRotationWords,
    rotationIndex: Math.min(rotationIndex, safeRotationWords.length - 1),
    streakCurrent: streak.current,
    activitiesToday: learningToday.completed,
    dailyGoal: Math.max(1, dailyLearningGoal),
    dueCount,
    retentionPercent: retention.percent,
    retentionHasEvidence: retention.reviewCount > 0,
    quickAddEnabled: config.quickAddEnabled,
    updatedAt: asOf.toISOString(),
  };
}
