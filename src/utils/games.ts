import type { GameAnswer, GameAttempt, GamePreferences, GameTimerMode, GameType, QuizAnswer, ReviewRating, Word } from '../types';

export const DEFAULT_GAME_PREFERENCES: GamePreferences = {
  hintsEnabled: true,
  timerMode: 'off',
};

const GAME_TIMER_SECONDS: Record<Exclude<GameTimerMode, 'off'>, number> = {
  relaxed: 45,
  focused: 30,
  challenge: 15,
};

export const GAME_XP_PER_CORRECT: Record<GameType, number> = {
  'speed-match': 2,
  'fill-gap': 3,
  'word-connections': 2,
  crossword: 3,
  'word-scramble': 2,
  hangman: 2,
  'rapid-fire': 2,
};

export const GAME_PERFECT_BONUS: Record<GameType, number> = {
  'speed-match': 3,
  'fill-gap': 4,
  'word-connections': 3,
  crossword: 8,
  'word-scramble': 3,
  hangman: 3,
  'rapid-fire': 6,
};

const REPLAY_XP_MULTIPLIER = 0.25;

function hashGameSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Returns a stable shuffle for a dated game. Random shuffles made it possible
 * to replay a different round under the same daily key and receive full XP.
 */
export function deterministicShuffle<T>(items: T[], seed: string): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      key: stableGameItemKey(item, index),
      rank: hashGameSeed(`${seed}:${stableGameItemKey(item, index)}`),
    }))
    .sort((first, second) => first.rank - second.rank || first.key.localeCompare(second.key) || first.index - second.index)
    .map(({ item }) => item);
}

function stableGameItemKey(item: unknown, index: number) {
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  if (item && typeof item === 'object' && 'id' in item) {
    const id = (item as { id?: unknown }).id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return JSON.stringify(item) ?? String(index);
}

export function getGameXp(
  attempt: Pick<GameAttempt, 'gameType' | 'gameKey' | 'score' | 'total'>,
  previousAttempts: GameAttempt[] = [],
) {
  const isReplay = previousAttempts.some(
    (previous) =>
      previous.gameType === attempt.gameType && previous.gameKey === attempt.gameKey,
  );
  const safeScore = Math.max(0, Math.min(attempt.score, Math.max(0, attempt.total)));
  const baseXp = safeScore * GAME_XP_PER_CORRECT[attempt.gameType];
  const perfectBonus = attempt.total > 0 && safeScore >= attempt.total
    ? GAME_PERFECT_BONUS[attempt.gameType]
    : 0;
  const earned = baseXp + (isReplay ? 0 : perfectBonus);

  if (!isReplay) return earned;
  return earned > 0 ? Math.max(1, Math.floor(earned * REPLAY_XP_MULTIPLIER)) : 0;
}

export function getGameXpLabel(
  gameType: GameType,
  total: number,
  previousAttempts: GameAttempt[] = [],
) {
  return `Up to ${getGameXp({ gameType, gameKey: '__preview__', score: total, total }, previousAttempts)} XP`;
}

/**
 * Games are recognition and application practice. One answer per word keeps
 * rapid games from accelerating mastery just because they repeat a tile.
 */
export function buildGameMasteryAnswers(
  answers: GameAnswer[],
  reviewedAt = new Date(),
): QuizAnswer[] {
  const answersByWord = new Map<string, GameAnswer>();
  answers.forEach((answer) => answersByWord.set(answer.wordId, answer));

  return [...answersByWord.values()].map((answer) => ({
    wordId: answer.wordId,
    wordTerm: answer.wordTerm,
    correct: answer.correct,
    difficulty: 'recognition',
    questionMode: 'true-false',
    answeredAt: answer.answeredAt ?? reviewedAt.toISOString(),
    responseTimeSeconds: answer.responseTimeSeconds,
    reviewRating: answer.correct ? 'correct' as ReviewRating : undefined,
    gameType: answer.gameType,
    gameKey: answer.gameKey,
  }));
}

export function getGameWords(words: Word[]) {
  return words.filter(
    (word) =>
      !word.mastery?.excludedFromPractice &&
      word.mastery?.librarySource !== 'collection',
  );
}

export function normalizeGamePreferences(
  preferences: Partial<GamePreferences> | undefined,
): GamePreferences {
  const timerMode = preferences?.timerMode;
  return {
    hintsEnabled: preferences?.hintsEnabled !== false,
    timerMode: timerMode === 'relaxed' || timerMode === 'focused' || timerMode === 'challenge'
      ? timerMode
      : 'off',
  };
}

export function getGameTimerSeconds(mode: GameTimerMode) {
  return mode === 'off' ? null : GAME_TIMER_SECONDS[mode];
}

export function getRapidFireDurationSeconds(mode: GameTimerMode) {
  if (mode === 'relaxed') return 90;
  if (mode === 'challenge') return 30;
  return 60;
}

export function getGameCoverage(words: Word[], history: GameAttempt[] = []) {
  const wordIds = new Set(words.map((word) => word.id));
  const practicedWordIds = new Set(
    history
      .flatMap((attempt) => attempt.answers ?? [])
      .map((answer) => answer.wordId)
      .filter((wordId) => wordIds.has(wordId)),
  );
  const practiced = practicedWordIds.size;
  return {
    practiced,
    total: words.length,
    remaining: Math.max(0, words.length - practiced),
  };
}

export function getGameRoundWords(
  gameType: GameType,
  words: Word[],
  count?: number,
  history: GameAttempt[] = [],
) {
  const periodKey = gameType === 'crossword' ? getGameWeekKey() : getGameDateKey();
  const ordered = deterministicShuffle(
    words,
    `${periodKey}:${gameType}:round:${history.length}`,
  );
  const usedWordIds = new Set(
    history.flatMap((attempt) => attempt.answers)
      .map((answer) => answer.wordId)
      .filter((wordId) => wordId && !wordId.startsWith('__')),
  );
  const freshWords = ordered.filter((word) => !usedWordIds.has(word.id));
  const previouslyUsedWords = ordered.filter((word) => usedWordIds.has(word.id));
  const rotated = [...freshWords, ...previouslyUsedWords];
  return count === undefined ? rotated : rotated.slice(0, count);
}

export function createUuid() {
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

export function getGameDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getGameWeekKey(date = new Date()) {
  const weekDate = new Date(date);
  const day = weekDate.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  weekDate.setDate(weekDate.getDate() - daysSinceMonday);
  return getGameDateKey(weekDate);
}

export function getGameAnswerWordIds(answers: GameAnswer[]) {
  return Array.from(new Set(answers.map((answer) => answer.wordId)));
}
