import type { AnalyticsData, QuizAnswer, QuizAttempt, QuizDifficultyPreference, QuizQuestion, QuizQuestionDifficulty, QuizQuestionMode, QuizQuestionTypePreference, QuizQuestionTypePreferences, QuizRecallPaceSignal, QuizSessionMode, TimeBasedLearningSettings, Word } from '../types';
import { FALLBACK_DEFINITIONS } from '../constants/data';
import { getCompleteFlashcardDefinition } from './dictionary';

const MAX_QUIZ_QUESTIONS = 10;
export const MAX_QUICK_PRACTICE_QUESTIONS = 20;
export const OMEGA_TEST_COOLDOWN_DAYS = 7;
export const OMEGA_TEST_COOLDOWN_MS = OMEGA_TEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const RECENT_ATTEMPTS_TO_AVOID = 3;
type QuestionChallenge = 'easy' | 'standard' | 'hard';
export const TIMED_LEARNING_SECONDS = 15;
export const FLUENT_RECALL_SECONDS = 6;
export const DEFAULT_TIME_BASED_LEARNING_SETTINGS: TimeBasedLearningSettings = {
  multipleChoiceSeconds: 15,
  fillInSeconds: 25,
  typedRecallSeconds: 30,
};

export const QUIZ_QUESTION_MODES: QuizQuestionMode[] = [
  'word-to-definition',
  'definition-to-word',
  'true-false',
  'typed-word',
  'sentence-usage',
  'sentence-completion',
  'closest-synonym',
];

export function normalizeQuestionTypePreferences(
  preferences: QuizQuestionTypePreferences | undefined,
): Record<QuizQuestionMode, QuizQuestionTypePreference> {
  const normalized = {} as Record<QuizQuestionMode, QuizQuestionTypePreference>;

  QUIZ_QUESTION_MODES.forEach((mode) => {
    const saved = preferences?.[mode];
    normalized[mode] = {
      enabled: saved?.enabled !== false,
      frequency: saved?.frequency === 'more' ? 'more' : 'normal',
    };
  });

  if (!QUIZ_QUESTION_MODES.some((mode) => normalized[mode].enabled)) {
    normalized['word-to-definition'] = { enabled: true, frequency: 'normal' };
  }

  return normalized;
}

export type QuizResponseSignalSummary = {
  fluent: number;
  successful: number;
  reinforcement: number;
  incorrect: number;
  total: number;
};

export type QuizRetrievalProfile = {
  recognitionPercent: number;
  recallPercent: number;
  recognitionEvidence: number;
  recallEvidence: number;
  totalAnswers: number;
  recognitionAccuracy: number;
  recallAccuracy: number;
  recognitionAttemptCount: number;
  recallAttemptCount: number;
  confidencePercent: number;
  directRecallCorrect: number;
  delayedDirectRecallCorrect: number;
};

export type QuizBuildOptions = {
  difficulty?: QuizDifficultyPreference;
  sessionMode?: QuizSessionMode;
  questionLimit?: number;
  questionTypePreferences?: QuizQuestionTypePreferences;
};

/**
 * Keeps the difficulty picker honest across every session. Assessment modes
 * deliberately set a minimum challenge, while normal practice respects the
 * learner's selected level exactly.
 */
export function getEffectiveQuizDifficulty(
  sessionMode: QuizSessionMode,
  selectedDifficulty: QuizDifficultyPreference = 'automatic',
): QuizDifficultyPreference {
  if (sessionMode === 'mastery-test' || sessionMode === 'omega-test') {
    return 'ultra';
  }
  if (sessionMode === 'challenge') {
    return selectedDifficulty === 'ultra' ? 'ultra' : 'hard';
  }
  return selectedDifficulty;
}

/**
 * Uses one timing policy for every quiz. Standard and review sessions wait
 * until a word is reasonably strong before adding time pressure; deliberate
 * assessment modes honor the learner's timing setting on every prompt.
 */
export function getQuizQuestionPace({
  sessionMode,
  questionDifficulty,
  wordMastery,
  timedLearningEnabled,
  settings = DEFAULT_TIME_BASED_LEARNING_SETTINGS,
}: {
  sessionMode: QuizSessionMode;
  questionDifficulty: QuizQuestionDifficulty | undefined;
  wordMastery: number;
  timedLearningEnabled: boolean;
  settings?: TimeBasedLearningSettings;
}) {
  const normalizedSettings = normalizeTimeBasedLearningSettings(settings);
  const standardWindow = getTimeBasedLearningLimitSeconds(
    questionDifficulty,
    normalizedSettings,
  );
  const isAssessment =
    sessionMode === 'challenge' ||
    sessionMode === 'mastery-test' ||
    sessionMode === 'omega-test';
  const isTimed =
    sessionMode === 'quick' ||
    (timedLearningEnabled && (isAssessment || wordMastery >= 80));

  return {
    isTimed,
    // Quick is intentionally brisk, but a learner's shorter accessibility or
    // pace setting still takes priority over the default 15-second ceiling.
    seconds: sessionMode === 'quick'
      ? Math.min(TIMED_LEARNING_SECONDS, standardWindow)
      : standardWindow,
  };
}

export function isDirectRecallQuestion(
  mode: QuizQuestionMode | undefined,
  difficulty: QuizQuestionDifficulty | undefined,
) {
  return mode === 'typed-word' || (!mode && difficulty === 'typed-recall');
}

export function getQuizRetrievalProfile(
  analytics: AnalyticsData,
  settings: TimeBasedLearningSettings = DEFAULT_TIME_BASED_LEARNING_SETTINGS,
): QuizRetrievalProfile {
  // A profile should describe the learner's current retrieval, not let a long
  // run of old, easier prompts overwhelm the feedback from recent practice.
  const answers = analytics.quizHistory
    .flatMap((attempt) =>
      attempt.answers.map((answer) => ({
        answer,
        answeredAt: answer.answeredAt ?? attempt.completedAt,
      })),
    )
    .sort((first, second) => first.answeredAt.localeCompare(second.answeredAt))
    .slice(-120);
  const lastDirectRecallAttemptAtByWord = new Map<string, Date>();
  let recognitionEvidence = 0;
  let recallEvidence = 0;
  let recognitionAttemptEvidence = 0;
  let recallAttemptEvidence = 0;
  let directRecallCorrect = 0;
  let delayedDirectRecallCorrect = 0;

  answers.forEach(({ answer, answeredAt }, index) => {
    const recallWeight = getRecallWeight(answer.questionMode, answer.difficulty);
    const recencyWeight = answers.length < 2
      ? 1
      : 0.6 + (index / (answers.length - 1)) * 0.4;
    const signal = answer.recallPace ??
      (typeof answer.responseTimeSeconds === 'number'
        ? getQuizRecallPaceSignal({
            correct: answer.correct,
            responseTimeSeconds: answer.responseTimeSeconds,
            difficulty: answer.difficulty,
            settings,
          })
        : answer.correct
          ? 'successful'
          : 'incorrect');
    const performanceWeight = answer.correct
      ? signal === 'fluent'
        ? 1
        : signal === 'successful'
          ? 0.9
          : 0.65
      : 0;
    const recognitionWeight = (1 - recallWeight) * recencyWeight;
    const directRecallWeight = recallWeight * recencyWeight;

    recognitionAttemptEvidence += recognitionWeight;
    recallAttemptEvidence += directRecallWeight;
    recognitionEvidence += recognitionWeight * performanceWeight;
    recallEvidence += directRecallWeight * performanceWeight;

    if (!isDirectRecallQuestion(answer.questionMode, answer.difficulty)) {
      return;
    }

    const answeredAtDate = new Date(answeredAt);
    if (!Number.isNaN(answeredAtDate.getTime())) {
      const previousDirectRecallAt = lastDirectRecallAttemptAtByWord.get(answer.wordId);
      if (
        answer.correct &&
        previousDirectRecallAt &&
        answeredAtDate.getTime() - previousDirectRecallAt.getTime() >= 86_400_000
      ) {
        delayedDirectRecallCorrect += 1;
      }
      lastDirectRecallAttemptAtByWord.set(answer.wordId, answeredAtDate);
    }
    if (answer.correct) {
      directRecallCorrect += 1;
    }
  });

  const totalEvidence = recognitionEvidence + recallEvidence;
  const recognitionAccuracy = recognitionAttemptEvidence
    ? Math.round((recognitionEvidence / recognitionAttemptEvidence) * 100)
    : 0;
  const recallAccuracy = recallAttemptEvidence
    ? Math.round((recallEvidence / recallAttemptEvidence) * 100)
    : 0;
  const confidencePercent = Math.round(
    Math.min(1, answers.length / 18) * 70 +
      Math.min(1, directRecallCorrect / 6) * 20 +
      Math.min(1, delayedDirectRecallCorrect / 2) * 10,
  );

  return {
    recognitionPercent: totalEvidence
      ? Math.round((recognitionEvidence / totalEvidence) * 100)
      : 0,
    recallPercent: totalEvidence
      ? Math.round((recallEvidence / totalEvidence) * 100)
      : 0,
    recognitionEvidence,
    recallEvidence,
    totalAnswers: answers.length,
    recognitionAccuracy,
    recallAccuracy,
    recognitionAttemptCount: Math.round(recognitionAttemptEvidence),
    recallAttemptCount: Math.round(recallAttemptEvidence),
    confidencePercent,
    directRecallCorrect,
    delayedDirectRecallCorrect,
  };
}

function getRecallWeight(
  mode: QuizQuestionMode | undefined,
  difficulty: QuizQuestionDifficulty | undefined,
) {
  const weights: Partial<Record<QuizQuestionMode, number>> = {
    'word-to-definition': 0.05,
    'true-false': 0.1,
    'sentence-usage': 0.25,
    'closest-synonym': 0.35,
    'definition-to-word': 0.55,
    'sentence-completion': 0.7,
    'typed-word': 1,
  };
  if (mode) return weights[mode] ?? 0.25;
  if (difficulty === 'typed-recall') return 1;
  if (difficulty === 'fill-in-options') return 0.6;
  if (difficulty === 'multiple-choice') return 0.25;
  return 0.1;
}

export function normalizeTimeBasedLearningSettings(
  settings: Partial<TimeBasedLearningSettings> | undefined,
): TimeBasedLearningSettings {
  return {
    multipleChoiceSeconds: clampTimeSetting(
      settings?.multipleChoiceSeconds,
      DEFAULT_TIME_BASED_LEARNING_SETTINGS.multipleChoiceSeconds,
      8,
      30,
    ),
    fillInSeconds: clampTimeSetting(
      settings?.fillInSeconds,
      DEFAULT_TIME_BASED_LEARNING_SETTINGS.fillInSeconds,
      12,
      45,
    ),
    typedRecallSeconds: clampTimeSetting(
      settings?.typedRecallSeconds,
      DEFAULT_TIME_BASED_LEARNING_SETTINGS.typedRecallSeconds,
      15,
      60,
    ),
  };
}

export function getTimeBasedLearningLimitSeconds(
  difficulty: QuizQuestionDifficulty | undefined,
  settings: TimeBasedLearningSettings = DEFAULT_TIME_BASED_LEARNING_SETTINGS,
) {
  const normalizedSettings = normalizeTimeBasedLearningSettings(settings);
  if (difficulty === 'typed-recall') return normalizedSettings.typedRecallSeconds;
  if (difficulty === 'fill-in-options') return normalizedSettings.fillInSeconds;
  return normalizedSettings.multipleChoiceSeconds;
}

export function getQuizRecallPaceSignal({
  correct,
  responseTimeSeconds,
  difficulty,
  settings,
}: Pick<QuizAnswer, 'correct' | 'responseTimeSeconds' | 'difficulty'> & {
  settings?: TimeBasedLearningSettings;
}): QuizRecallPaceSignal {
  if (!correct) return 'incorrect';
  const responseTime = responseTimeSeconds ?? Number.POSITIVE_INFINITY;
  if (responseTime < FLUENT_RECALL_SECONDS) return 'fluent';
  return responseTime <= getTimeBasedLearningLimitSeconds(difficulty, settings)
    ? 'successful'
    : 'reinforcement';
}

export function getQuizResponseSignalSummary(
  analytics: AnalyticsData,
  settings: TimeBasedLearningSettings = DEFAULT_TIME_BASED_LEARNING_SETTINGS,
): QuizResponseSignalSummary {
  return analytics.quizHistory.reduce<QuizResponseSignalSummary>(
    (summary, attempt) => {
      attempt.answers.forEach((answer) => {
        if (typeof answer.responseTimeSeconds !== 'number') return;
        const signal = answer.recallPace ?? getQuizRecallPaceSignal({
          correct: answer.correct,
          responseTimeSeconds: answer.responseTimeSeconds,
          difficulty: answer.difficulty,
          settings,
        });
        summary[signal] += 1;
        summary.total += 1;
      });
      return summary;
    },
    { fluent: 0, successful: 0, reinforcement: 0, incorrect: 0, total: 0 },
  );
}

function clampTimeSetting(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(minimum, Math.min(maximum, Math.round(numericValue)))
    : fallback;
}

export function getTimedLearningBonusXp(
  secondsRemaining: number,
  timeLimitSeconds = TIMED_LEARNING_SECONDS,
) {
  if (secondsRemaining <= 0) return 0;
  return Math.max(
    1,
    Math.min(5, Math.ceil((secondsRemaining / Math.max(1, timeLimitSeconds)) * 5)),
  );
}

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

export function buildQuiz(
  words: Word[],
  recentAttempts: QuizAttempt[] = [],
  masteryByWordId: Record<string, number> = {},
  priorityWordIds: string[] = [],
  options: QuizBuildOptions = {},
): QuizQuestion[] {
  const questionLimit = clampQuestionLimit(options.questionLimit);
  const quizWords = pickQuizWords(
    words,
    recentAttempts,
    priorityWordIds,
    questionLimit,
  );
  const usesAutomaticStandardSession =
    !options.questionLimit &&
    (!options.difficulty || options.difficulty === 'automatic') &&
    (!options.sessionMode || options.sessionMode === 'standard');

  if (usesAutomaticStandardSession && quizWords.length > 0 && quizWords.length < 4) {
    return buildSmallCollectionQuiz(
      quizWords,
      masteryByWordId,
      options.questionTypePreferences,
    );
  }

  const planWords = options.questionLimit
    ? expandQuizWords(quizWords, questionLimit)
    : quizWords;
  const modes = getQuestionModesForSession(
    planWords,
    quizWords,
    masteryByWordId,
    options,
  );
  const difficulty = getEffectiveQuizDifficulty(
    options.sessionMode ?? 'standard',
    options.difficulty ?? 'automatic',
  );

  return planWords.map((word, index) => {
    const mode = modes[index];
    const question = buildQuestionForMode(
      word,
      quizWords,
      index,
      mode,
      getContextOffset(word, recentAttempts, index),
      difficulty,
    );
    return {
      ...question,
      strictSpelling:
        (difficulty === 'hard' ||
          difficulty === 'ultra' ||
          options.sessionMode === 'mastery-test') &&
        mode === 'typed-word',
    };
  });
}

/**
 * A weekly assessment that deliberately revisits every saved practice word.
 * Each word gets one varied recognition/context prompt and one strict direct
 * recall prompt, so its score reflects more than familiarity with one format.
 */
export function buildOmegaTest(
  words: Word[],
  recentAttempts: QuizAttempt[] = [],
): QuizQuestion[] {
  const omegaWords = words.filter((word) => !word.mastery?.excludedFromPractice);

  return shuffle(omegaWords).flatMap((word, wordIndex) =>
    buildOmegaQuestionsForWord(word, omegaWords, recentAttempts, wordIndex),
  );
}

/**
 * Builds the same Omega assessment without monopolizing the JavaScript thread.
 * Giving React Native a turn after each word keeps the loading state responsive
 * even for large libraries.
 */
export async function buildOmegaTestAsync(
  words: Word[],
  recentAttempts: QuizAttempt[] = [],
): Promise<QuizQuestion[]> {
  const omegaWords = words.filter((word) => !word.mastery?.excludedFromPractice);
  const shuffledWords = shuffle(omegaWords);
  const questions: QuizQuestion[] = [];

  for (const [wordIndex, word] of shuffledWords.entries()) {
    questions.push(
      ...buildOmegaQuestionsForWord(word, omegaWords, recentAttempts, wordIndex),
    );

    // Keep long libraries responsive without adding a timer delay per word.
    if (
      wordIndex < shuffledWords.length - 1 &&
      (wordIndex + 1) % 8 === 0
    ) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return questions;
}

function buildOmegaQuestionsForWord(
  word: Word,
  omegaWords: Word[],
  recentAttempts: QuizAttempt[],
  wordIndex: number,
): QuizQuestion[] {
  const contextOffset = getContextOffset(word, recentAttempts, wordIndex);
  return [
    buildFastOmegaRecognitionQuestion(word, omegaWords, wordIndex, contextOffset),
    {
      ...buildTypedWordQuestion(word, contextOffset + 1, true),
      strictSpelling: true,
    },
  ];
}

function buildFastOmegaRecognitionQuestion(
  word: Word,
  words: Word[],
  index: number,
  contextOffset: number,
): QuizQuestion {
  if (words.length < 2) {
    const answer = getQuestionMeaning(word, true);
    const distractors = FALLBACK_DEFINITIONS.filter(
      (definition) => definition !== answer,
    ).slice(0, 3);
    return {
      word,
      prompt: 'WHAT DOES THIS WORD MEAN?',
      displayText: word.term,
      answer,
      options: shuffle([answer, ...distractors]),
      mode: 'word-to-definition',
      difficulty: getQuestionDifficulty('word-to-definition'),
      helperText: 'Choose the meaning that matches this word.',
      feedback: `“${word.term}” means ${answer.toLowerCase()}`,
    };
  }

  const recallPrompt = getSafeRecallPrompt(word, contextOffset, index % 2 === 1, true);
  const otherWords = words.filter((item) => item.id !== word.id);
  const rotationStart = otherWords.length ? index % otherWords.length : 0;
  const distractors = pickTopUnique(
    [...otherWords.slice(rotationStart), ...otherWords.slice(0, rotationStart)].map(
      (item) => item.term,
    ),
    word.term,
    3,
  );

  return {
    word,
    prompt: recallPrompt.prompt,
    displayText: recallPrompt.displayText,
    answer: word.term,
    options: shuffle([word.term, ...distractors]),
    mode: 'definition-to-word',
    difficulty: getQuestionDifficulty('definition-to-word'),
    helperText: recallPrompt.chooseHelperText,
    feedback: `The word is “${word.term}”.`,
  };
}

export function getOmegaTestAttempts(analytics: AnalyticsData) {
  return analytics.quizHistory.filter((attempt) =>
    attempt.answers.some((answer) => answer.sessionMode === 'omega-test'),
  );
}

export function getOmegaTestStatus(
  analytics: AnalyticsData,
  now = Date.now(),
) {
  const attempts = getOmegaTestAttempts(analytics);
  const mostRecent = attempts.reduce<QuizAttempt | null>((latest, attempt) => {
    if (!latest) return attempt;
    return Date.parse(attempt.completedAt) > Date.parse(latest.completedAt)
      ? attempt
      : latest;
  }, null);
  const mostRecentTimestamp = mostRecent ? Date.parse(mostRecent.completedAt) : 0;
  const nextAvailableAt = mostRecentTimestamp + OMEGA_TEST_COOLDOWN_MS;
  const remainingMs = mostRecent
    ? Math.max(0, nextAvailableAt - now)
    : 0;

  return {
    attempts,
    mostRecent,
    available: remainingMs === 0,
    nextAvailableAt: mostRecent ? new Date(nextAvailableAt).toISOString() : null,
    remainingMs,
  };
}

/**
 * Category practice intentionally gives a very small category enough varied
 * retrieval opportunities to feel like a useful round. Standard quizzes use
 * the same variety when a learner has fewer than four practice words.
 */
export function buildCategoryPracticeQuiz(
  words: Word[],
  recentAttempts: QuizAttempt[] = [],
  masteryByWordId: Record<string, number> = {},
  priorityWordIds: string[] = [],
  options: QuizBuildOptions = {},
): QuizQuestion[] {
  if (
    (options.difficulty && options.difficulty !== 'automatic') ||
    (options.sessionMode && options.sessionMode !== 'standard')
  ) {
    return buildQuiz(words, recentAttempts, masteryByWordId, priorityWordIds, options);
  }
  if (words.length >= 4) {
    return buildQuiz(words, recentAttempts, masteryByWordId, priorityWordIds);
  }

  const quizWords = pickQuizWords(words, recentAttempts, priorityWordIds);
  return buildSmallCollectionQuiz(
    quizWords,
    masteryByWordId,
    options.questionTypePreferences,
  );
}

function buildSmallCollectionQuiz(
  quizWords: Word[],
  masteryByWordId: Record<string, number>,
  questionTypePreferences: QuizQuestionTypePreferences | undefined,
) {
  const target = getCategoryPracticeQuizTarget(quizWords.length);
  const plan = getCategoryPracticeQuestionPlan(
    quizWords,
    masteryByWordId,
    target,
    normalizeQuestionTypePreferences(questionTypePreferences),
  );
  const questionKeys = new Set<string>();

  return plan.flatMap(({ word, mode }, index) => {
    const question = buildQuestionForMode(word, quizWords, index, mode, index);
    const key = `${question.prompt}\u0000${question.displayText}\u0000${question.answer}`;
    if (questionKeys.has(key)) return [];
    questionKeys.add(key);
    return [question];
  });
}

export function getCategoryPracticeQuizTarget(wordCount: number) {
  if (wordCount <= 0) return 0;
  if (wordCount === 1) return 3;
  if (wordCount === 2) return 4;
  if (wordCount === 3) return 6;
  return Math.min(wordCount, MAX_QUIZ_QUESTIONS);
}

function clampQuestionLimit(limit: number | undefined) {
  if (!limit) return MAX_QUIZ_QUESTIONS;
  return Math.max(1, Math.min(MAX_QUICK_PRACTICE_QUESTIONS, Math.round(limit)));
}

function expandQuizWords(words: Word[], questionLimit: number) {
  if (words.length === 0) return [];
  const expanded = [...words];
  while (expanded.length < questionLimit) {
    expanded.push(...shuffle(words));
  }
  return expanded.slice(0, questionLimit);
}

function getQuestionModesForSession(
  planWords: Word[],
  quizWords: Word[],
  masteryByWordId: Record<string, number>,
  options: QuizBuildOptions,
) {
  const questionTypePreferences = normalizeQuestionTypePreferences(
    options.questionTypePreferences,
  );
  const difficulty = getEffectiveQuizDifficulty(
    options.sessionMode ?? 'standard',
    options.difficulty ?? 'automatic',
  );

  if (difficulty === 'automatic' && planWords.length === quizWords.length) {
    return getBalancedQuestionModes(
      planWords,
      masteryByWordId,
      questionTypePreferences,
    );
  }

  const counts = new Map<QuizQuestionMode, number>();
  const modes: QuizQuestionMode[] = [];
  const usedModesByWordId = new Map<string, Set<QuizQuestionMode>>();
  planWords.forEach((word, index) => {
    const candidates = getEnabledModeCandidates(
      word,
      quizWords,
      masteryByWordId[word.id] ?? word.reviews * 12,
      difficulty,
      questionTypePreferences,
    );
    const lastMode = modes.at(-1);
    const nonRepeatingCandidates = candidates.filter((mode) => mode !== lastMode);
    const modeCandidates = nonRepeatingCandidates.length
      ? nonRepeatingCandidates
      : candidates;
    const usedForWord = usedModesByWordId.get(word.id) ?? new Set();
    const unseenForWord = modeCandidates.filter((mode) => !usedForWord.has(mode));
    const pool = unseenForWord.length ? unseenForWord : modeCandidates;
    const typedTarget = difficulty === 'hard'
      ? Math.ceil((index + 1) * 0.7)
      : 0;
    const typedCount = counts.get('typed-word') ?? 0;
    const mode =
      difficulty === 'ultra'
        ? 'typed-word'
        : difficulty === 'hard' && pool.includes('typed-word') && typedCount < typedTarget
          ? 'typed-word'
          : pickLeastUsedMode(pool, counts, lastMode, questionTypePreferences);
    modes.push(mode);
    usedForWord.add(mode);
    usedModesByWordId.set(word.id, usedForWord);
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  });
  return modes;
}

function getDifficultyModeCandidates(
  word: Word,
  words: Word[],
  masteryScore: number,
  difficulty: QuizDifficultyPreference,
): QuizQuestionMode[] {
  const adaptive = getModeCandidates(word, masteryScore, words);
  if (difficulty === 'automatic' || difficulty === 'standard') return adaptive;
  if (difficulty === 'ultra') return ['typed-word' as const];
  if (difficulty === 'easy') {
    const easy = adaptive.filter(
      (mode) => mode === 'word-to-definition' || mode === 'true-false' || mode === 'definition-to-word',
    );
    return easy.length ? easy : ['word-to-definition', 'true-false'];
  }

  const hard = adaptive.filter(
    (mode) =>
      mode === 'typed-word' ||
      mode === 'sentence-usage' ||
      mode === 'sentence-completion' ||
      mode === 'closest-synonym' ||
      mode === 'definition-to-word',
  );
  // Hard deliberately leans on direct recall, but it pairs it with the
  // most meaningful contextual prompts available so it measures knowledge
  // rather than simply repeating the same clue.
  const contextualHard = hard.filter((mode) => mode !== 'typed-word');
  return contextualHard.length
    ? ['typed-word', ...contextualHard]
    : ['typed-word'];
}

function getEnabledModeCandidates(
  word: Word,
  words: Word[],
  masteryScore: number,
  difficulty: QuizDifficultyPreference,
  preferences: Record<QuizQuestionMode, QuizQuestionTypePreference>,
) {
  const adaptiveCandidates = getDifficultyModeCandidates(
    word,
    words,
    masteryScore,
    difficulty,
  );
  const enabledAdaptive = adaptiveCandidates.filter((mode) => preferences[mode].enabled);
  if (enabledAdaptive.length) return enabledAdaptive;

  const enabledSupported = getSupportedQuestionModesForWord(word, words)
    .filter((mode) => preferences[mode].enabled);
  return enabledSupported.length ? enabledSupported : adaptiveCandidates;
}

export function getMistakeReviewWordIds(
  analytics: AnalyticsData,
  settings: TimeBasedLearningSettings = DEFAULT_TIME_BASED_LEARNING_SETTINGS,
) {
  const priority = new Map<string, number>();
  analytics.quizHistory.forEach((attempt) => {
    attempt.answers.forEach((answer) => {
      const signal = answer.recallPace ??
        (typeof answer.responseTimeSeconds === 'number'
          ? getQuizRecallPaceSignal({
              correct: answer.correct,
              responseTimeSeconds: answer.responseTimeSeconds,
              difficulty: answer.difficulty,
              settings,
            })
          : answer.correct ? 'successful' : 'incorrect');
      const weight = !answer.correct || signal === 'incorrect'
        ? 3
        : signal === 'reinforcement' || answer.reviewRating === 'hard'
          ? 2
          : 0;
      if (weight) priority.set(answer.wordId, (priority.get(answer.wordId) ?? 0) + weight);
    });
  });
  return [...priority.entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([wordId]) => wordId);
}

function getCategoryPracticeQuestionPlan(
  words: Word[],
  masteryByWordId: Record<string, number>,
  target: number,
  preferences = normalizeQuestionTypePreferences(undefined),
) {
  const supportedModes = getSupportedCategoryPracticeModes(words)
    .filter((mode) => preferences[mode].enabled);
  const availableModes = supportedModes.length
    ? supportedModes
    : getSupportedCategoryPracticeModes(words);
  const maxTypedRecall = Math.max(1, Math.round(target * 0.35));
  const usedModesByWordId = new Map<string, Set<QuizQuestionMode>>();
  const modeCounts = new Map<QuizQuestionMode, number>();
  const plan: { word: Word; mode: QuizQuestionMode }[] = [];
  let lastMode: QuizQuestionMode | undefined;

  while (plan.length < target) {
    let addedQuestion = false;

    for (const word of words) {
      if (plan.length >= target) break;

      const usedModes = usedModesByWordId.get(word.id) ?? new Set();
      if (usedModes.size >= Math.min(3, availableModes.length)) continue;

      const masteryScore = masteryByWordId[word.id] ?? word.reviews * 12;
      const availableCandidates = getCategoryPracticeModeCandidates(
        word,
        masteryScore,
        availableModes,
        words,
      ).filter((mode) => !usedModes.has(mode));
      const candidates = availableCandidates.filter(
        (mode) => mode !== 'typed-word' ||
          (modeCounts.get('typed-word') ?? 0) < maxTypedRecall,
      );
      const eligibleCandidates = candidates.length ? candidates : availableCandidates;
      if (eligibleCandidates.length === 0) continue;

      const mode = pickLeastUsedMode(eligibleCandidates, modeCounts, lastMode, preferences);
      usedModes.add(mode);
      usedModesByWordId.set(word.id, usedModes);
      modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
      plan.push({ word, mode });
      lastMode = mode;
      addedQuestion = true;
    }

    if (!addedQuestion) break;
  }

  return plan;
}

function getSupportedCategoryPracticeModes(words: Word[]) {
  // A definition-to-word question needs at least one saved word as a genuine
  // alternative. With one word, use the other three existing formats instead.
  const baseModes = words.length < 2
    ? (['word-to-definition', 'true-false', 'typed-word'] as QuizQuestionMode[])
    : (['word-to-definition', 'definition-to-word', 'true-false', 'typed-word'] as QuizQuestionMode[]);
  const contextualModes: QuizQuestionMode[] = [];

  if (words.some((word) => canBuildSentenceUsageQuestion(word, words))) {
    contextualModes.push('sentence-usage');
  }
  if (words.some((word) => canBuildSentenceCompletionQuestion(word, words))) {
    contextualModes.push('sentence-completion');
  }
  if (words.some((word) => canBuildClosestSynonymQuestion(word, words))) {
    contextualModes.push('closest-synonym');
  }

  return [...baseModes, ...contextualModes];
}

function getSupportedQuestionModesForWord(word: Word, words: Word[]) {
  return [
    'word-to-definition',
    ...(words.length >= 2 ? ['definition-to-word' as const] : []),
    'true-false',
    'typed-word',
    ...(canBuildSentenceUsageQuestion(word, words) ? ['sentence-usage' as const] : []),
    ...(canBuildSentenceCompletionQuestion(word, words) ? ['sentence-completion' as const] : []),
    ...(canBuildClosestSynonymQuestion(word, words) ? ['closest-synonym' as const] : []),
  ] as QuizQuestionMode[];
}

function getCategoryPracticeModeCandidates(
  word: Word,
  masteryScore: number,
  supportedModes: QuizQuestionMode[],
  words: Word[],
) {
  const preferred = getModeCandidates(word, masteryScore, words);
  return [
    ...preferred,
    ...supportedModes.filter(
      (mode) => !preferred.includes(mode) && !isContextualMode(mode),
    ),
  ].filter((mode) => supportedModes.includes(mode));
}

function isContextualMode(mode: QuizQuestionMode) {
  return (
    mode === 'sentence-usage' ||
    mode === 'sentence-completion' ||
    mode === 'closest-synonym'
  );
}

function pickLeastUsedMode(
  candidates: QuizQuestionMode[],
  counts: Map<QuizQuestionMode, number>,
  lastMode: QuizQuestionMode | undefined,
  preferences = normalizeQuestionTypePreferences(undefined),
) {
  const sorted = [...candidates].sort(
    (first, second) =>
      (counts.get(first) ?? 0) / getModeFrequencyWeight(first, preferences) -
        (counts.get(second) ?? 0) / getModeFrequencyWeight(second, preferences) ||
      candidates.indexOf(first) - candidates.indexOf(second),
  );
  return sorted.find((mode) => mode !== lastMode) ?? sorted[0];
}

function getModeFrequencyWeight(
  mode: QuizQuestionMode,
  preferences: Record<QuizQuestionMode, QuizQuestionTypePreference>,
) {
  return preferences[mode].frequency === 'more' ? 2 : 1;
}

function buildQuestionForMode(
  word: Word,
  words: Word[],
  index: number,
  mode: QuizQuestionMode,
  contextOffset = index,
  selectedDifficulty: QuizDifficultyPreference = 'automatic',
) {
  const useDetailedClues = selectedDifficulty === 'hard' || selectedDifficulty === 'ultra';
  const questionChallenge = getQuestionChallenge(selectedDifficulty);
  if (mode === 'definition-to-word') {
    return buildDefinitionToWordQuestion(
      word,
      words,
      index,
      contextOffset,
      useDetailedClues,
      questionChallenge,
    );
  }

  if (mode === 'true-false') {
    return buildTrueFalseQuestion(
      word,
      words,
      index,
      useDetailedClues,
      questionChallenge,
    );
  }

  if (mode === 'typed-word') {
    return buildTypedWordQuestion(word, contextOffset, useDetailedClues);
  }

  if (mode === 'sentence-usage') {
    return buildSentenceUsageQuestion(
      word,
      words,
      index,
      contextOffset,
      questionChallenge,
    );
  }

  if (mode === 'sentence-completion') {
    return buildSentenceCompletionQuestion(
      word,
      words,
      index,
      contextOffset,
      questionChallenge,
    );
  }

  if (mode === 'closest-synonym') {
    return buildClosestSynonymQuestion(word, words, index, questionChallenge);
  }

  return buildWordToDefinitionQuestion(
    word,
    words,
    index,
    useDetailedClues,
    questionChallenge,
  );
}

function getQuestionChallenge(
  selectedDifficulty: QuizDifficultyPreference,
): QuestionChallenge {
  if (selectedDifficulty === 'easy') return 'easy';
  if (selectedDifficulty === 'hard' || selectedDifficulty === 'ultra') return 'hard';
  return 'standard';
}

function getBalancedQuestionModes(
  words: Word[],
  masteryByWordId: Record<string, number>,
  preferences = normalizeQuestionTypePreferences(undefined),
) {
  const maxTypedRecall = Math.max(1, Math.round(words.length * 0.35));
  const includesEarlyLearningWord = words.some(
    (word) => (masteryByWordId[word.id] ?? word.reviews * 12) < 70,
  );
  const counts = new Map<QuizQuestionMode, number>();
  const modes: QuizQuestionMode[] = [];

  words.forEach((word) => {
    const masteryScore = masteryByWordId[word.id] ?? word.reviews * 12;
    const candidates = getEnabledModeCandidates(
      word,
      words,
      masteryScore,
      'automatic',
      preferences,
    );
    const lastMode = modes.at(-1);
    const typedLimited = candidates.filter(
      (candidate) =>
        candidate !== 'typed-word' ||
        (counts.get('typed-word') ?? 0) < maxTypedRecall,
    );
    const available = typedLimited.length ? typedLimited : candidates;
    const nonRepeating = available.filter((candidate) => candidate !== lastMode);
    const pool = nonRepeating.length ? nonRepeating : available;
    const mode = pickLeastUsedMode(pool, counts, lastMode, preferences);

    modes.push(mode);
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  });

  // Keep one quick recognition check in a normal mixed quiz. Contextual modes
  // are valuable, but they should complement rather than crowd out the core
  // recall formats learners expect to see.
  if (
    includesEarlyLearningWord &&
    words.length >= 3 &&
    !modes.includes('true-false') &&
    preferences['true-false'].enabled
  ) {
    const replacementIndex = modes.findIndex(
      (mode) => mode !== 'typed-word',
    );
    if (replacementIndex >= 0) {
      modes[replacementIndex] = 'true-false';
    }
  }
  if (
    includesEarlyLearningWord &&
    words.length >= 2 &&
    !modes.includes('definition-to-word') &&
    preferences['definition-to-word'].enabled
  ) {
    const replacementIndex = modes.findIndex(
      (mode) => mode !== 'typed-word' && mode !== 'true-false',
    );
    if (replacementIndex >= 0) {
      modes[replacementIndex] = 'definition-to-word';
    }
  }
  if (
    words.length >= 4 &&
    words.some((word) => canBuildClosestSynonymQuestion(word, words)) &&
    !modes.includes('closest-synonym') &&
    preferences['closest-synonym'].enabled
  ) {
    const replacementIndex = modes.findIndex(
      (mode, index) =>
        canBuildClosestSynonymQuestion(words[index], words) &&
        mode !== 'typed-word' &&
        mode !== 'sentence-usage' &&
        mode !== 'sentence-completion',
    );
    if (replacementIndex >= 0) {
      modes[replacementIndex] = 'closest-synonym';
    }
  }

  return modes;
}

function getModeCandidates(
  word: Word,
  masteryScore: number,
  words: Word[] = [],
): QuizQuestionMode[] {
  const canUseSentence = canBuildSentenceUsageQuestion(word, words);
  const canUseSentenceCompletion = canBuildSentenceCompletionQuestion(word, words);
  const canUseSynonym = canBuildClosestSynonymQuestion(word, words);
  const directRecallCorrect = word.mastery?.directRecallCorrect ?? 0;
  const delayedDirectRecallCorrect = word.mastery?.delayedDirectRecallCorrect ?? 0;
  const contextualModes: QuizQuestionMode[] = [
    ...(canUseSentence ? ['sentence-usage' as const] : []),
    ...(canUseSentenceCompletion ? ['sentence-completion' as const] : []),
    ...(canUseSynonym ? ['closest-synonym' as const] : []),
  ];

  if (word.mastery?.lastReviewResult === 'wrong') {
    return ['word-to-definition', 'true-false', 'definition-to-word', ...contextualModes];
  }
  if (masteryScore < 25) {
    return ['word-to-definition', 'true-false', 'definition-to-word'];
  }
  if (masteryScore < 40) {
    return ['definition-to-word', 'true-false', 'word-to-definition', ...contextualModes];
  }
  if (masteryScore < 70) {
    return [
      ...(canUseSentence ? ['sentence-usage' as const] : []),
      'definition-to-word',
      ...(canUseSentenceCompletion ? ['sentence-completion' as const] : []),
      'true-false',
      ...(canUseSynonym ? ['closest-synonym' as const] : []),
    ];
  }
  if (directRecallCorrect < 2) {
    return [
      'typed-word',
      ...(canUseSentenceCompletion ? ['sentence-completion' as const] : []),
      'definition-to-word',
      ...contextualModes,
      'true-false',
    ];
  }
  if (delayedDirectRecallCorrect < 1) {
    return [
      'typed-word',
      ...(canUseSynonym ? ['closest-synonym' as const] : []),
      ...(canUseSentenceCompletion ? ['sentence-completion' as const] : []),
      ...contextualModes,
      'definition-to-word',
    ];
  }
  return ['typed-word', ...contextualModes, 'definition-to-word', 'true-false'];
}

function pickQuizWords(
  words: Word[],
  recentAttempts: QuizAttempt[],
  priorityWordIds: string[],
  questionLimit = MAX_QUIZ_QUESTIONS,
) {
  const practiceWords = words.filter(
    (word) => !word.mastery?.excludedFromPractice,
  );
  const wordsById = new Map(practiceWords.map((word) => [word.id, word]));
  const scheduledPriorityWords = Array.from(new Set(priorityWordIds))
    .map((wordId) => wordsById.get(wordId))
    .filter((word): word is Word => Boolean(word));
  const priorityWordIdsSet = new Set(
    scheduledPriorityWords.map((word) => word.id),
  );
  const remainingWords = practiceWords.filter(
    (word) => !priorityWordIdsSet.has(word.id),
  );
  const focusedWords = shuffle(
    remainingWords.filter((word) => word.mastery?.focusMode === true),
  );
  const focusedWordIds = new Set(focusedWords.map((word) => word.id));
  const nonFocusedWords = remainingWords.filter(
    (word) => !focusedWordIds.has(word.id),
  );
  const recentWordIds = new Set(
    recentAttempts
      .slice(0, RECENT_ATTEMPTS_TO_AVOID)
      .flatMap((attempt) => attempt.answers.map((answer) => answer.wordId)),
  );
  const lessRecentWords = nonFocusedWords.filter(
    (word) => !recentWordIds.has(word.id),
  );
  const fillWords =
    lessRecentWords.length >=
    Math.min(
      nonFocusedWords.length,
      questionLimit - scheduledPriorityWords.length - focusedWords.length,
    )
      ? lessRecentWords
      : nonFocusedWords;

  return [
    ...scheduledPriorityWords,
    ...focusedWords,
    ...shuffle(fillWords).filter(
      (word) => !priorityWordIdsSet.has(word.id) && !focusedWordIds.has(word.id),
    ),
  ].slice(0, questionLimit);
}

/**
 * Move from recognition to recall as a word becomes more familiar. New words
 * show the word first, building words check comprehension, and strong words
 * ask the learner to recall the word from its meaning.
 */
export function getQuestionModeForMastery(
  masteryScore: number,
): QuizQuestionMode {
  if (masteryScore >= 85) return 'typed-word';
  if (masteryScore >= 70) return 'definition-to-word';
  if (masteryScore >= 25) return 'true-false';
  return 'word-to-definition';
}

export function getQuestionDifficulty(
  mode: QuizQuestionMode,
): QuizQuestionDifficulty {
  if (mode === 'true-false') return 'recognition';
  if (
    mode === 'word-to-definition' ||
    mode === 'sentence-usage' ||
    mode === 'closest-synonym'
  ) {
    return 'multiple-choice';
  }
  if (mode === 'definition-to-word') return 'fill-in-options';
  if (mode === 'sentence-completion') return 'fill-in-options';
  return 'typed-recall';
}

export function evaluateQuizAnswer(
  answer: string,
  response: string | null,
  mode: QuizQuestionMode,
  strictSpelling = false,
) {
  if (response === null) {
    return { correct: false, hasSpellingNote: false };
  }
  if (mode !== 'typed-word') {
    return { correct: response === answer, hasSpellingNote: false };
  }

  const normalizedAnswer = normalizeTypedAnswer(answer);
  const normalizedResponse = normalizeTypedAnswer(response);
  if (normalizedResponse === normalizedAnswer) {
    return { correct: true, hasSpellingNote: false };
  }

  const hasSpellingNote = !strictSpelling && isCloseTypedAnswer(
    normalizedAnswer,
    normalizedResponse,
  );
  return { correct: hasSpellingNote, hasSpellingNote };
}

export function getTypedRecallHint(word: Word, hintStep: number) {
  const answer = word.term.trim();
  if (!answer || hintStep < 1) return null;

  if (hintStep === 1) {
    return `It starts with “${answer.charAt(0)}”.`;
  }
  if (hintStep === 2) {
    return `${answer.replace(/[^\p{L}\p{N}]/gu, '').length} letters · ${getHintPattern(answer)}`;
  }

  if (word.partOfSpeech) {
    return `Part of speech: ${word.partOfSpeech}.`;
  }

  const hiddenExample = hideWordInExample(word.example, answer);
  if (hiddenExample) {
    return `Example: ${hiddenExample}`;
  }

  if (word.basicInfo) {
    return word.basicInfo;
  }

  return 'Think about the complete meaning above.';
}

function buildWordToDefinitionQuestion(
  word: Word,
  words: Word[],
  index: number,
  useDetailedClues = false,
  questionChallenge: QuestionChallenge = 'standard',
): QuizQuestion {
  const answer = getQuestionMeaning(word, useDetailedClues);
  const distractors = getDefinitionDistractors(
    word,
    words,
    index,
    useDetailedClues,
    questionChallenge,
  );

  return {
    word,
    prompt: 'WHAT DOES THIS WORD MEAN?',
    displayText: word.term,
    answer,
    options: shuffle([answer, ...distractors]),
    mode: 'word-to-definition',
    difficulty: getQuestionDifficulty('word-to-definition'),
    helperText: 'Choose the meaning that matches this word.',
    feedback: `"${word.term}" means ${answer.toLowerCase()}`,
  };
}

function buildDefinitionToWordQuestion(
  word: Word,
  words: Word[],
  index: number,
  contextOffset = index,
  useDetailedClues = false,
  questionChallenge: QuestionChallenge = 'standard',
): QuizQuestion {
  const distractors = getWordDistractors(word, words, index, questionChallenge);
  const recallPrompt = getSafeRecallPrompt(
    word,
    contextOffset,
    contextOffset % 2 === 1,
    useDetailedClues,
  );

  return {
    word,
    prompt: recallPrompt.prompt,
    displayText: recallPrompt.displayText,
    answer: word.term,
    options: shuffle([word.term, ...distractors]),
    mode: 'definition-to-word',
    difficulty: getQuestionDifficulty('definition-to-word'),
    helperText: recallPrompt.chooseHelperText,
    feedback: `The word is "${word.term}".`,
  };
}

function buildTrueFalseQuestion(
  word: Word,
  words: Word[],
  index: number,
  useDetailedClues = false,
  questionChallenge: QuestionChallenge = 'standard',
): QuizQuestion {
  const shouldBeTrue = words.length < 2 || getTermHash(word.term) % 2 === 0;
  const pairedWord = shouldBeTrue
    ? word
    : getAlternateWord(word, words, questionChallenge) ?? word;
  const displayedMeaning = getQuestionMeaning(pairedWord, useDetailedClues);

  return {
    word,
    prompt: 'IS THIS MATCH CORRECT?',
    displayText: `"${word.term}" means ${displayedMeaning.toLowerCase()}`,
    answer: shouldBeTrue ? 'True' : 'False',
    options: ['True', 'False'],
    mode: 'true-false',
    difficulty: getQuestionDifficulty('true-false'),
    helperText: 'Choose True if the word and meaning match.',
    feedback: `"${word.term}" means ${getMeaning(word).toLowerCase()}`,
  };
}

function buildTypedWordQuestion(
  word: Word,
  contextOffset = 0,
  useDetailedClues = false,
): QuizQuestion {
  // Direct recall is the strictest question type. When there is a genuine
  // saved example, alternating it with the definition avoids repeating the
  // exact same cue in longer hard and Ultra practice rounds.
  const recallPrompt = getSafeRecallPrompt(
    word,
    contextOffset,
    contextOffset % 2 === 1,
    useDetailedClues,
  );

  return {
    word,
    prompt: recallPrompt.prompt,
    displayText: recallPrompt.displayText,
    answer: word.term,
    options: [],
    mode: 'typed-word',
    difficulty: getQuestionDifficulty('typed-word'),
    helperText: recallPrompt.typedHelperText,
    feedback: `The word is "${word.term}".`,
  };
}

function buildSentenceUsageQuestion(
  word: Word,
  words: Word[],
  index: number,
  contextOffset: number,
  questionChallenge: QuestionChallenge = 'standard',
): QuizQuestion {
  const answer = getCorrectExample(word, contextOffset);
  const distractors = getSentenceDistractors(
    word,
    words,
    answer,
    index,
    questionChallenge,
  );

  return {
    word,
    prompt: 'CHOOSE THE SENTENCE',
    displayText: `Which sentence uses “${word.term}” correctly?`,
    answer,
    options: shuffle([answer, ...distractors]),
    mode: 'sentence-usage',
    difficulty: getQuestionDifficulty('sentence-usage'),
    helperText: 'Look for the context that best matches the word’s meaning.',
    feedback: `“${word.term}” means ${getMeaning(word).toLowerCase()}`,
  };
}

function buildSentenceCompletionQuestion(
  word: Word,
  words: Word[],
  index: number,
  contextOffset: number,
  questionChallenge: QuestionChallenge = 'standard',
): QuizQuestion {
  const context = getCorrectExample(word, contextOffset);
  const blankedContext = hideWordInExample(context, word.term) ?? context;
  const distractors = getWordDistractors(word, words, index, questionChallenge);

  return {
    word,
    prompt: 'COMPLETE THE CONTEXT',
    displayText: blankedContext,
    answer: word.term,
    options: shuffle([word.term, ...distractors]),
    mode: 'sentence-completion',
    difficulty: getQuestionDifficulty('sentence-completion'),
    helperText: 'Choose the saved word that makes the context make sense.',
    feedback: `“${word.term}” fits because it means ${getMeaning(word).toLowerCase()}`,
  };
}

function buildClosestSynonymQuestion(
  word: Word,
  words: Word[],
  index: number,
  questionChallenge: QuestionChallenge = 'standard',
): QuizQuestion {
  const answer = getSynonymCandidates(word)[0];
  const distractors = getSynonymDistractors(
    word,
    words,
    answer,
    index,
    questionChallenge,
  );

  return {
    word,
    prompt: 'CHOOSE THE CLOSEST SYNONYM',
    displayText: `Which word is closest in meaning to “${word.term}”?`,
    answer,
    options: shuffle([answer, ...distractors]),
    mode: 'closest-synonym',
    difficulty: getQuestionDifficulty('closest-synonym'),
    helperText: 'Choose the word with the most similar meaning.',
    feedback: `“${answer}” is a close synonym of “${word.term}”.`,
  };
}

function getMeaning(word: Word) {
  return getCompleteFlashcardDefinition(word.definition, word.simpleDefinition);
}

function getQuestionMeaning(word: Word, useDetailedClues = false) {
  const detailedDefinition = word.definition.replace(/\s+/g, ' ').trim();
  return useDetailedClues && detailedDefinition
    ? detailedDefinition
    : getMeaning(word);
}

type RecallPrompt = {
  prompt: string;
  displayText: string;
  typedHelperText: string;
  chooseHelperText: string;
};

/**
 * A definition such as "to wrong; to injure" effectively gives away
 * “injury.” Prefer a genuine saved context in those cases, then mask the
 * leaking word-family as a last resort so every direct-recall prompt remains
 * answerable without displaying the answer itself.
 */
function getSafeRecallPrompt(
  word: Word,
  contextOffset = 0,
  preferContext = false,
  useDetailedClues = false,
): RecallPrompt {
  const definitions = Array.from(
    new Set(
      [
        ...(useDetailedClues ? [word.definition] : []),
        getMeaning(word),
        word.definition,
        word.simpleDefinition,
      ]
        .map((definition) => definition?.replace(/\s+/g, ' ').trim())
        .filter((definition): definition is string => Boolean(definition)),
    ),
  );
  const safeDefinition = definitions.find(
    (definition) => !containsAnswerFamily(definition, word.term),
  );

  const context = getSafeRecallContext(word, contextOffset);

  if (preferContext && context) {
    return {
      prompt: 'COMPLETE THE CONTEXT',
      displayText: context,
      typedHelperText: 'Type the saved word that completes this context, then check your answer.',
      chooseHelperText: 'Choose the saved word that best completes this context.',
    };
  }

  if (safeDefinition) {
    return {
      prompt: 'WHAT WORD MEANS THIS?',
      displayText: safeDefinition,
      typedHelperText: 'Type the word that matches this meaning, then check your answer.',
      chooseHelperText: 'Choose the word that matches this meaning.',
    };
  }

  if (context) {
    return {
      prompt: 'COMPLETE THE CONTEXT',
      displayText: context,
      typedHelperText: 'Type the saved word that completes this context, then check your answer.',
      chooseHelperText: 'Choose the saved word that best completes this context.',
    };
  }

  const maskedDefinition = maskAnswerFamily(
    definitions[0] ?? 'Recall this word from your saved learning notes.',
    word.term,
  );
  return {
    prompt: 'WHAT WORD FITS THIS CLUE?',
    displayText: maskedDefinition,
    typedHelperText: 'Use the clue to recall the word, then check your answer.',
    chooseHelperText: 'Choose the word that best fits this clue.',
  };
}

function getSafeRecallContext(word: Word, contextOffset = 0) {
  const safeContexts = getQualityContextExamples(word)
    .map((context) => hideWordInExample(context, word.term))
    .filter(
      (context): context is string =>
        context !== null && !containsAnswerFamily(context, word.term),
    );

  return safeContexts.length
    ? safeContexts[contextOffset % safeContexts.length]
    : null;
}

function containsAnswerFamily(value: string, term: string) {
  const answerFamily = getAnswerFamilyStem(term);
  if (!answerFamily) return false;

  return getPromptWords(value).some((candidate) => {
    const candidateFamily = getAnswerFamilyStem(candidate);
    if (!candidateFamily) return false;
    return (
      candidateFamily === answerFamily ||
      (answerFamily.length >= 5 &&
        candidateFamily.length >= 5 &&
        getSharedPrefixLength(answerFamily, candidateFamily) >= 5)
    );
  });
}

function maskAnswerFamily(value: string, term: string) {
  const answerFamily = getAnswerFamilyStem(term);
  if (!answerFamily) return value;

  return value.replace(/[\p{L}\p{N}'-]+/gu, (candidate) =>
    getAnswerFamilyStem(candidate) === answerFamily ||
    (answerFamily.length >= 5 &&
      getAnswerFamilyStem(candidate).length >= 5 &&
      getSharedPrefixLength(answerFamily, getAnswerFamilyStem(candidate)) >= 5)
      ? '_____'
      : candidate,
  );
}

function getPromptWords(value: string) {
  return value.match(/[\p{L}\p{N}'-]+/gu) ?? [];
}

function getAnswerFamilyStem(value: string) {
  let normalized = value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
  if (normalized.length < 4) return normalized;

  normalized = normalized
    .replace(/ies$/, 'y')
    .replace(/(izations?|isations?|ational|fulness|ousness|iveness|ments?|ness|tions?|sions?|ities|ity|ingly|edly|ing|ed|ously|ous|ively|ive|fully|ful|ally|al|es|s)$/, '');

  if (normalized.endsWith('e') && normalized.length > 4) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized.endsWith('y') && normalized.length > 5) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function getSharedPrefixLength(first: string, second: string) {
  let length = 0;
  while (length < first.length && first[length] === second[length]) {
    length += 1;
  }
  return length;
}

function getDefinitionDistractors(
  word: Word,
  words: Word[],
  index: number,
  useDetailedClues = false,
  questionChallenge: QuestionChallenge = 'standard',
) {
  const answer = getQuestionMeaning(word, useDetailedClues);
  const otherDefinitions = getRankedDistractorWords(word, words, questionChallenge)
    .map((item) => getQuestionMeaning(item, useDetailedClues));
  const fallbacks = FALLBACK_DEFINITIONS.filter(
    (definition) => definition !== answer,
  );

  return pickTopUnique(
    Array.from(
      new Set([
        ...otherDefinitions,
        ...fallbacks.slice(index),
        ...fallbacks.slice(0, index),
      ]),
    ),
    answer,
    3,
  );
}

function getWordDistractors(
  word: Word,
  words: Word[],
  index: number,
  questionChallenge: QuestionChallenge = 'standard',
) {
  return pickTopUnique(
    getRankedDistractorWords(word, words, questionChallenge).map((item) => item.term),
    word.term,
    3,
  );
}

/**
 * Strong distractors should be plausible, not random. Same-part-of-speech
 * words with overlapping definition language are usually the fairest nearby
 * alternatives; words from a different family are preferred to answer clones.
 */
function getRankedDistractorWords(
  word: Word,
  words: Word[],
  questionChallenge: QuestionChallenge = 'standard',
) {
  const ranked = words
    .filter(
      (item) =>
        item.id !== word.id &&
        !containsAnswerFamily(item.term, word.term),
    )
    .sort(
      (first, second) =>
        getDistractorRelevance(word, second) - getDistractorRelevance(word, first) ||
        first.term.localeCompare(second.term),
    );

  return questionChallenge === 'easy' ? ranked.reverse() : ranked;
}

function getDistractorRelevance(word: Word, candidate: Word) {
  const wordTokens = getMeaningfulTokens(
    `${word.definition} ${word.simpleDefinition ?? ''}`,
  );
  const candidateTokens = new Set(
    getMeaningfulTokens(`${candidate.definition} ${candidate.simpleDefinition ?? ''}`),
  );
  const sharedTokenCount = wordTokens.filter((token) => candidateTokens.has(token)).length;
  const samePartOfSpeech = Boolean(word.partOfSpeech) &&
    word.partOfSpeech === candidate.partOfSpeech;

  return (samePartOfSpeech ? 12 : 0) + sharedTokenCount * 3;
}

function getMeaningfulTokens(value: string) {
  const ignored = new Set([
    'a', 'an', 'and', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
    'of', 'on', 'or', 'that', 'the', 'this', 'to', 'used', 'with', 'word',
  ]);
  return Array.from(
    new Set(
      getPromptWords(value)
        .map((token) => getAnswerFamilyStem(token))
        .filter((token) => token.length >= 4 && !ignored.has(token)),
    ),
  );
}

function canBuildSentenceUsageQuestion(word: Word, words: Word[]) {
  const answer = getCorrectExample(word);
  return Boolean(answer) && getSentenceDistractors(word, words, answer, 0).length >= 2;
}

function canBuildSentenceCompletionQuestion(word: Word, words: Word[]) {
  return Boolean(getCorrectExample(word)) && getWordDistractors(word, words, 0).length >= 2;
}

function getCorrectExample(word: Word, contextOffset = 0) {
  const examples = getQualityContextExamples(word);
  return examples.length ? examples[contextOffset % examples.length] : '';
}

function getQualityContextExamples(word: Word) {
  return Array.from(
    new Map(
      [word.example, ...(word.contextExamples ?? []), ...(word.wordnik_examples ?? [])]
        .map((context) => context.replace(/\s+/g, ' ').trim())
        .filter((context) => isQualityContextExample(context, word.term))
        .map((context) => [context.toLocaleLowerCase(), context]),
    ).values(),
  );
}

function isQualityContextExample(context: string, term: string) {
  if (
    context.length < 24 ||
    context.length > 240 ||
    !includesWholeTerm(context, term)
  ) {
    return false;
  }

  const normalized = context.toLocaleLowerCase();
  const normalizedTerm = term.trim().toLocaleLowerCase();
  return !(
    normalized.startsWith('i learned the word ') ||
    normalized === `${normalizedTerm} example.` ||
    normalized === `${normalizedTerm} example` ||
    normalized.startsWith('in a simple explanation,') ||
    normalized.startsWith('in more formal writing,')
  );
}

function getContextOffset(
  word: Word,
  recentAttempts: QuizAttempt[],
  index: number,
) {
  const priorAnswers = recentAttempts.reduce(
    (total, attempt) =>
      total + attempt.answers.filter((answer) => answer.wordId === word.id).length,
    0,
  );
  return priorAnswers + index;
}

function getSentenceDistractors(
  word: Word,
  words: Word[],
  answer: string,
  index: number,
  questionChallenge: QuestionChallenge = 'standard',
) {
  const candidates = getRankedDistractorWords(word, words, questionChallenge).flatMap((item) => {
    const source = getCorrectExample(item);
    const replacement = replaceWholeTerm(source, item.term, word.term);
    return replacement && replacement !== answer ? [replacement] : [];
  });

  return pickTopUnique(candidates, answer, 3);
}

function canBuildClosestSynonymQuestion(word: Word, words: Word[]) {
  const answer = getSynonymCandidates(word)[0];
  return Boolean(answer) && getSynonymDistractors(word, words, answer, 0).length >= 2;
}

function getSynonymCandidates(word: Word) {
  return Array.from(
    new Set([...(word.synonyms ?? []), ...(word.commonWords ?? [])])
      .values(),
  )
    .map((synonym) => synonym.trim())
    .filter(
      (synonym) =>
        synonym.length >= 3 &&
        synonym.length <= 48 &&
        synonym.toLocaleLowerCase() !== word.term.toLocaleLowerCase() &&
        !containsAnswerFamily(synonym, word.term),
    );
}

function getSynonymDistractors(
  word: Word,
  words: Word[],
  answer: string,
  index: number,
  questionChallenge: QuestionChallenge = 'standard',
) {
  const candidates = getRankedDistractorWords(word, words, questionChallenge)
    .flatMap((item) => [...getSynonymCandidates(item), item.term]);

  return pickTopUnique(candidates, answer, 3);
}

function pickTopUnique(
  candidates: string[],
  answer: string,
  count: number,
) {
  return getUniqueDistractorCandidates(candidates, answer).slice(0, count);
}

function rotateAndPickUnique(
  candidates: string[],
  answer: string,
  index: number,
  count: number,
) {
  const unique = getUniqueDistractorCandidates(candidates, answer);
  const start = unique.length === 0 ? 0 : index % unique.length;
  return [...unique.slice(start), ...unique.slice(0, start)].slice(0, count);
}

function getUniqueDistractorCandidates(candidates: string[], answer: string) {
  const normalizedAnswer = answer.toLocaleLowerCase();
  return Array.from(
    new Map(
      candidates
        .map((candidate) => candidate.trim())
        .filter(
          (candidate) =>
            candidate.length > 1 && candidate.toLocaleLowerCase() !== normalizedAnswer,
        )
      .map((candidate) => [candidate.toLocaleLowerCase(), candidate]),
    ).values(),
  );
}

function includesWholeTerm(value: string, term: string) {
  if (!value.trim() || !term.trim()) return false;
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escapedTerm}\\b`, 'i').test(value);
}

function replaceWholeTerm(value: string, sourceTerm: string, replacement: string) {
  if (!value.trim() || !sourceTerm.trim()) return null;
  const escapedTerm = sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
  if (!expression.test(value)) return null;
  return value.replace(expression, replacement).trim();
}

function getAlternateWord(
  word: Word,
  words: Word[],
  questionChallenge: QuestionChallenge = 'standard',
) {
  return getRankedDistractorWords(word, words, questionChallenge)[0];
}

function getTermHash(term: string) {
  return term
    .split('')
    .reduce((total, character) => total + character.charCodeAt(0), 0);
}

function getHintPattern(answer: string) {
  const revealIndexes = new Set([
    0,
    Math.floor(answer.length / 2),
    Math.max(0, answer.length - 1),
  ]);

  return Array.from(answer)
    .map((character, index) => {
      if (!/[\p{L}\p{N}]/u.test(character)) return character;
      return revealIndexes.has(index) ? character : '_';
    })
    .join(' ');
}

function hideWordInExample(example: string, term: string) {
  if (!example.trim()) return null;
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hidden = example.replace(new RegExp(`\\b${escapedTerm}\\b`, 'gi'), '_____');
  return hidden === example ? null : hidden;
}

function normalizeTypedAnswer(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function isCloseTypedAnswer(answer: string, response: string) {
  if (!answer || !response) return false;
  const allowedTypos = Math.min(
    3,
    Math.max(1, Math.floor(answer.length * 0.18)),
  );
  if (response.length < answer.length - allowedTypos) return false;

  return getEditDistance(answer, response) <= allowedTypos;
}

function getEditDistance(first: string, second: string) {
  const previous = Array.from(
    { length: second.length + 1 },
    (_, index) => index,
  );

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let diagonal = previous[0];
    previous[0] = firstIndex;

    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const above = previous[secondIndex];
      previous[secondIndex] = Math.min(
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + 1,
        diagonal +
          (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return previous[second.length];
}
