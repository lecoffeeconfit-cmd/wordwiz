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
): Promise<UserLearningData> {
  const [wordsResult, quizResult, reviewsResult, reminderResult] =
    await Promise.all([
      supabase
        .from('words')
        .select(WORD_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
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

  const firstError =
    getQueryError('words', wordsResult.error) ??
    getQueryError('quiz_attempts', quizResult.error) ??
    getQueryError('card_reviews', reviewsResult.error) ??
    getQueryError('reminder_settings', reminderResult.error);

  if (firstError) {
    throw firstError;
  }

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

export async function saveCloudWord(userId: string, word: Word) {
  const payload = toWordPayload(userId, word);
  const query = isUuid(word.id)
    ? supabase.from('words').upsert({ ...payload, id: word.id }).select(WORD_COLUMNS)
    : supabase.from('words').insert(payload).select(WORD_COLUMNS);
  const { data, error } = await query.single();

  if (error) {
    throw getQueryError('words', error);
  }

  return mapWordRow(data as unknown as WordRow);
}

export async function deleteCloudWord(userId: string, wordId: string) {
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
}

export async function saveCloudCardReview(
  userId: string,
  event: CardStudyEvent,
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
}

export async function saveCloudWordReviews(
  userId: string,
  wordId: string,
  reviews: number,
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
}

export async function saveCloudQuizAttempt(
  userId: string,
  attempt: QuizAttempt,
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
}

export async function saveCloudReminderSettings(
  userId: string,
  settings: ReminderSettings,
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
    created_at: word.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function parseQuizAnswers(value: unknown): QuizAnswer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((answer) => {
      if (
        typeof answer === 'object' &&
        answer !== null &&
        'wordId' in answer &&
        'correct' in answer &&
        typeof answer.wordId === 'string' &&
        typeof answer.correct === 'boolean'
      ) {
        return {
          wordId: answer.wordId,
          correct: answer.correct,
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
