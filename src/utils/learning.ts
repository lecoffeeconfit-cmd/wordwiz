import type { AnalyticsData, StreakStats, Word } from '../types';
import { getDayKey, getPreviousDayKey, getRecentDays } from './date';

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
