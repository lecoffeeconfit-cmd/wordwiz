import type {
  AnalyticsData,
  CardStudyEvent,
  QuizAnswer,
  QuizAttempt,
  QuizProgress,
  ReminderSettings,
  Word,
} from '../types';
import { getDayKey } from '../utils';
import { supabase } from './supabase';

type WordRow = {
  id: string;
  term: string;
  definition: string;
  simple_definition: string | null;
  example: string;
  part_of_speech: string | null;
  pronunciation: string | null;
  origin: string | null;
  origin_period: string | null;
  synonyms: string[] | null;
  common_words: string[] | null;
  basic_info: string | null;
  reviews: number;
  mastery_data: unknown;
  is_flagged?: boolean | null;
  flagged_at?: string | null;
  created_at: string;
};

type QuizAttemptRow = {
  id: string;
  quiz_date: string;
  score: number;
  total: number;
  duration_seconds: number;
  answers: unknown;
  completed_at: string;
};

type CardReviewRow = {
  id: string;
  word_id: string | null;
  review_date: string;
  remembered: boolean;
  duration_seconds: number;
  studied_at: string;
};

type ReminderSettingsRow = {
  enabled: boolean;
  hour: number;
  minute: number;
};

type CloudRequestContext = {
  screen: string;
  reason: string;
};

const MAX_CLOUD_WORDS = 1000;
const CLOUD_SYNC_LOGS_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_WORDWIZ_EGRESS_LOGS === 'true';

const WORD_COLUMNS = [
  'id',
  'term',
  'definition',
  'simple_definition',
  'example',
  'part_of_speech',
  'pronunciation',
  'origin',
  'origin_period',
  'synonyms',
  'common_words',
  'basic_info',
  'reviews',
  'mastery_data',
  'is_flagged',
  'flagged_at',
  'created_at',
].join(',');

const QUIZ_ATTEMPT_COLUMNS = [
  'id',
  'quiz_date',
  'score',
  'total',
  'duration_seconds',
  'answers',
  'completed_at',
].join(',');

const CARD_REVIEW_COLUMNS = [
  'id',
  'word_id',
  'review_date',
  'remembered',
  'duration_seconds',
  'studied_at',
].join(',');

export type UserLearningData = {
  words: Word[];
  quizProgress: QuizProgress | null;
  analytics: AnalyticsData;
  reminderSettings: ReminderSettings | null;
};

export async function fetchUserLearningData(
  userId: string,
  context?: CloudRequestContext,
): Promise<UserLearningData> {
  let wordColumns = WORD_COLUMNS;
  let [wordsResult, quizResult, reviewsResult, reminderResult] =
    await Promise.all([
      supabase
        .from('words')
        .select(WORD_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(MAX_CLOUD_WORDS),
      supabase
        .from('quiz_attempts')
        .select(QUIZ_ATTEMPT_COLUMNS)
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })
        .limit(30),
      supabase
        .from('card_reviews')
        .select(CARD_REVIEW_COLUMNS)
        .eq('user_id', userId)
        .order('studied_at', { ascending: false })
        .limit(80),
      supabase
        .from('reminder_settings')
        .select('enabled,hour,minute')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

  if (isMissingFlagColumns(wordsResult.error)) {
    wordColumns = omitFlagColumns(wordColumns);
    wordsResult = await supabase
      .from('words')
      .select(wordColumns)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_CLOUD_WORDS);
  }

  if (isMissingMasteryDataColumn(wordsResult.error)) {
    wordColumns = wordColumns.replace('mastery_data,', '');
    wordsResult = await supabase
      .from('words')
      .select(wordColumns)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_CLOUD_WORDS);
  }

  const firstError =
    getQueryError('words', wordsResult.error) ??
    getQueryError('quiz_attempts', quizResult.error) ??
    getQueryError('card_reviews', reviewsResult.error) ??
    getQueryError('reminder_settings', reminderResult.error);

  if (firstError) {
    throw firstError;
  }

  logCloudRead('words', wordsResult.data, context, {
    rows: wordsResult.data?.length ?? 0,
    cappedAt: MAX_CLOUD_WORDS,
  });
  logCloudRead('quiz_attempts', quizResult.data, context, {
    rows: quizResult.data?.length ?? 0,
    cappedAt: 30,
  });
  logCloudRead('card_reviews', reviewsResult.data, context, {
    rows: reviewsResult.data?.length ?? 0,
    cappedAt: 80,
  });
  logCloudRead('reminder_settings', reminderResult.data, context, {
    rows: reminderResult.data ? 1 : 0,
  });

  const quizHistory = ((quizResult.data ?? []) as unknown as QuizAttemptRow[]).map(
    mapQuizAttemptRow,
  );
  const cardHistory = ((reviewsResult.data ?? []) as unknown as CardReviewRow[]).map(
    mapCardReviewRow,
  );
  const todayProgress =
    quizHistory.find((attempt) => attempt.date === getDayKey()) ?? null;

  return {
    words: ((wordsResult.data ?? []) as unknown as WordRow[]).map(mapWordRow),
    quizProgress: todayProgress
      ? {
          date: todayProgress.date,
          score: todayProgress.score,
          total: todayProgress.total,
        }
      : null,
    analytics: {
      quizHistory,
      cardHistory,
    },
    reminderSettings: reminderResult.data
      ? mapReminderSettingsRow(reminderResult.data as ReminderSettingsRow)
      : null,
  };
}

export async function seedUserLearningData({
  userId,
  words,
  analytics,
  reminderSettings,
}: {
  userId: string;
  words: Word[];
  analytics: AnalyticsData;
  reminderSettings: ReminderSettings;
}) {
  const savedWords = await Promise.all(
    words.map((word) => saveCloudWord(userId, word)),
  );

  await Promise.all([
    ...analytics.quizHistory.map((attempt) =>
      saveCloudQuizAttempt(userId, attempt),
    ),
    ...analytics.cardHistory.map((event) => saveCloudCardReview(userId, event)),
    saveCloudReminderSettings(userId, reminderSettings),
  ]);

  return savedWords;
}

export async function saveCloudWord(
  userId: string,
  word: Word,
  context?: CloudRequestContext,
) {
  const payload = toWordPayload(userId, word);
  const hasCloudId = isUuid(word.id);
  const cloudPayload = hasCloudId ? { ...payload, id: word.id } : payload;
  let { error } = hasCloudId
    ? await supabase.from('words').upsert(cloudPayload)
    : await supabase.from('words').insert(cloudPayload);

  let fallbackPayload: Record<string, unknown> = cloudPayload;
  if (isMissingFlagColumns(error)) {
    fallbackPayload = omitFlagFields(fallbackPayload);
    ({ error } = hasCloudId
      ? await supabase.from('words').upsert(fallbackPayload)
      : await supabase.from('words').insert(fallbackPayload));
  }

  if (isMissingMasteryDataColumn(error)) {
    fallbackPayload = omitMasteryData(fallbackPayload);
    ({ error } = hasCloudId
      ? await supabase.from('words').upsert(fallbackPayload)
      : await supabase.from('words').insert(fallbackPayload));
  }

  if (error) {
    throw getQueryError('words', error);
  }

  logCloudWrite('words:save', payload, context);

  return word;
}

export async function saveCloudWords(
  userId: string,
  words: Word[],
  context?: CloudRequestContext,
) {
  if (words.length === 0) {
    return;
  }

  const payloads = words.map((word) => ({
    ...toWordPayload(userId, word),
    ...(isUuid(word.id) ? { id: word.id } : {}),
  }));
  let { error } = await supabase.from('words').upsert(payloads);

  let fallbackPayloads: Record<string, unknown>[] = payloads;
  if (isMissingFlagColumns(error)) {
    fallbackPayloads = fallbackPayloads.map(omitFlagFields);
    ({ error } = await supabase.from('words').upsert(fallbackPayloads));
  }

  if (isMissingMasteryDataColumn(error)) {
    fallbackPayloads = fallbackPayloads.map(omitMasteryData);
    ({ error } = await supabase.from('words').upsert(fallbackPayloads));
  }

  if (error) {
    throw getQueryError('words', error);
  }

  logCloudWrite('words:batch_save', payloads, context, { rows: payloads.length });
}

export async function deleteCloudWord(
  userId: string,
  wordId: string,
  context?: CloudRequestContext,
) {
  if (!isUuid(wordId)) {
    return;
  }

  const { error } = await supabase
    .from('words')
    .delete()
    .eq('user_id', userId)
    .eq('id', wordId);

  if (error) {
    throw getQueryError('words', error);
  }

  logCloudWrite('words:delete', { wordId }, context);
}

export async function saveCloudCardReview(
  userId: string,
  event: CardStudyEvent,
  context?: CloudRequestContext,
) {
  const { error } = await supabase.from('card_reviews').insert({
    user_id: userId,
    word_id: isUuid(event.wordId) ? event.wordId : null,
    review_date: event.date,
    remembered: event.remembered,
    duration_seconds: event.durationSeconds,
    studied_at: event.studiedAt,
  });

  if (error) {
    throw getQueryError('card_reviews', error);
  }

  logCloudWrite(
    'card_reviews:insert',
    {
      wordId: event.wordId,
      date: event.date,
    },
    context,
  );
}

export async function saveCloudWordReviews(
  userId: string,
  wordId: string,
  reviews: number,
  context?: CloudRequestContext,
) {
  if (!isUuid(wordId)) {
    return;
  }

  const { error } = await supabase
    .from('words')
    .update({
      reviews,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', wordId);

  if (error) {
    throw getQueryError('words', error);
  }

  logCloudWrite('words:review_count', { wordId, reviews }, context);
}

export async function saveCloudQuizAttempt(
  userId: string,
  attempt: QuizAttempt,
  context?: CloudRequestContext,
) {
  const { error } = await supabase.from('quiz_attempts').insert({
    user_id: userId,
    quiz_date: attempt.date,
    score: attempt.score,
    total: attempt.total,
    duration_seconds: attempt.durationSeconds,
    answers: attempt.answers,
    completed_at: attempt.completedAt,
  });

  if (error) {
    throw getQueryError('quiz_attempts', error);
  }

  logCloudWrite(
    'quiz_attempts:insert',
    {
      answers: attempt.answers.length,
      total: attempt.total,
    },
    context,
  );
}

export async function saveCloudReminderSettings(
  userId: string,
  settings: ReminderSettings,
  context?: CloudRequestContext,
) {
  const { error } = await supabase.from('reminder_settings').upsert({
    user_id: userId,
    enabled: settings.enabled,
    hour: settings.hour,
    minute: settings.minute,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw getQueryError('reminder_settings', error);
  }

  logCloudWrite(
    'reminder_settings:upsert',
    {
      enabled: settings.enabled,
      hour: settings.hour,
      minute: settings.minute,
    },
    context,
  );
}

function logCloudRead(
  source: string,
  payload: unknown,
  context?: CloudRequestContext,
  details: Record<string, number> = {},
) {
  if (!CLOUD_SYNC_LOGS_ENABLED) {
    return;
  }

  console.info('[WordWiz Supabase egress]', {
    source,
    direction: 'download',
    screen: context?.screen ?? 'unknown',
    reason: context?.reason ?? 'unknown',
    estimatedBytes: estimatePayloadBytes(payload),
    ...details,
  });
}

function logCloudWrite(
  source: string,
  payload: unknown,
  context?: CloudRequestContext,
  details: Record<string, number> = {},
) {
  if (!CLOUD_SYNC_LOGS_ENABLED) {
    return;
  }

  console.info('[WordWiz Supabase request]', {
    source,
    direction: 'upload',
    screen: context?.screen ?? 'unknown',
    reason: context?.reason ?? 'unknown',
    estimatedBytes: estimatePayloadBytes(payload),
    ...details,
  });
}

function estimatePayloadBytes(payload: unknown) {
  try {
    return new Blob([JSON.stringify(payload ?? null)]).size;
  } catch {
    return JSON.stringify(payload ?? null).length;
  }
}

function getQueryError(tableName: string, error: { message?: string } | null) {
  if (!error) {
    return null;
  }

  return new Error(`${tableName}: ${error.message ?? 'Supabase request failed'}`);
}

function mapWordRow(row: WordRow): Word {
  return {
    id: row.id,
    term: row.term,
    definition: row.definition,
    simpleDefinition: row.simple_definition ?? undefined,
    example: row.example,
    partOfSpeech: row.part_of_speech ?? undefined,
    pronunciation: row.pronunciation ?? undefined,
    origin: row.origin ?? undefined,
    originPeriod: row.origin_period ?? undefined,
    synonyms: row.synonyms ?? [],
    commonWords: row.common_words ?? [],
    basicInfo: row.basic_info ?? undefined,
    createdAt: row.created_at,
    reviews: row.reviews,
    mastery: parseMasteryProgress(row.mastery_data),
    isFlagged: row.is_flagged === true,
    flaggedAt: row.flagged_at ?? undefined,
  };
}

function mapQuizAttemptRow(row: QuizAttemptRow): QuizAttempt {
  return {
    id: row.id,
    date: row.quiz_date,
    score: row.score,
    total: row.total,
    durationSeconds: row.duration_seconds,
    answers: parseQuizAnswers(row.answers),
    completedAt: row.completed_at,
  };
}

function mapCardReviewRow(row: CardReviewRow): CardStudyEvent {
  return {
    id: row.id,
    wordId: row.word_id ?? '',
    date: row.review_date,
    remembered: row.remembered,
    durationSeconds: row.duration_seconds,
    studiedAt: row.studied_at,
  };
}

function mapReminderSettingsRow(row: ReminderSettingsRow): ReminderSettings {
  return {
    enabled: row.enabled,
    hour: row.hour,
    minute: row.minute,
  };
}

function toWordPayload(userId: string, word: Word) {
  return {
    user_id: userId,
    term: word.term,
    definition: word.definition,
    simple_definition: word.simpleDefinition ?? null,
    example: word.example,
    part_of_speech: word.partOfSpeech ?? null,
    pronunciation: word.pronunciation ?? null,
    origin: word.origin ?? null,
    origin_period: word.originPeriod ?? null,
    synonyms: word.synonyms ?? [],
    common_words: word.commonWords ?? [],
    basic_info: word.basicInfo ?? null,
    reviews: word.reviews,
    mastery_data: word.mastery ?? {},
    is_flagged: word.isFlagged === true,
    flagged_at: word.isFlagged ? word.flaggedAt ?? null : null,
    created_at: word.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function omitMasteryData<T extends { mastery_data?: unknown }>(payload: T) {
  const { mastery_data: _masteryData, ...legacyPayload } = payload;
  return legacyPayload;
}

function omitFlagColumns(columns: string) {
  return columns.replace('is_flagged,', '').replace('flagged_at,', '');
}

function omitFlagFields<
  T extends { is_flagged?: unknown; flagged_at?: unknown },
>(payload: T) {
  const { is_flagged: _isFlagged, flagged_at: _flaggedAt, ...legacyPayload } =
    payload;
  return legacyPayload;
}

function isMissingMasteryDataColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.toLowerCase().includes('mastery_data'));
}

function isMissingFlagColumns(error: { message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? '';
  return message.includes('is_flagged') || message.includes('flagged_at');
}

function parseMasteryProgress(value: unknown): Word['mastery'] {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length === 0
  ) {
    return undefined;
  }

  return value as Word['mastery'];
}

function parseQuizAnswers(value: unknown): QuizAnswer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((answer): QuizAnswer | null => {
      if (
        typeof answer === 'object' &&
        answer !== null &&
        'wordId' in answer &&
        'correct' in answer &&
        typeof answer.wordId === 'string' &&
        typeof answer.correct === 'boolean'
      ) {
        const difficulty =
          'difficulty' in answer &&
          (answer.difficulty === 'recognition' ||
            answer.difficulty === 'multiple-choice' ||
            answer.difficulty === 'fill-in-options' ||
            answer.difficulty === 'typed-recall')
            ? answer.difficulty
            : undefined;
        const answeredAt =
          'answeredAt' in answer && typeof answer.answeredAt === 'string'
            ? answer.answeredAt
            : undefined;
        const reviewRating =
          'reviewRating' in answer &&
          (answer.reviewRating === 'hard' ||
            answer.reviewRating === 'correct' ||
            answer.reviewRating === 'easy')
            ? answer.reviewRating
            : undefined;

        return {
          wordId: answer.wordId,
          correct: answer.correct,
          difficulty,
          answeredAt,
          reviewRating,
        };
      }

      return null;
    })
    .filter((answer): answer is QuizAnswer => Boolean(answer));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
