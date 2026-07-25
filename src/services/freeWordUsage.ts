import type { StudySetMembership, Word } from '../types';
import { supabase } from './supabase';

export const FREE_WORD_LIMIT = 10;

export type FreeWordUsage = {
  monthKey: string;
  wordsAdded: number;
  limit: number;
};

export class FreeWordLimitError extends Error {
  constructor() {
    super('You’ve used your 10 free word additions for this month.');
    this.name = 'FreeWordLimitError';
  }
}

export class DuplicateWordError extends Error {
  constructor() {
    super('This word is already saved in your account.');
    this.name = 'DuplicateWordError';
  }
}

/**
 * Indicates that the app's word-saving RPC has not been deployed (or no longer
 * matches the production schema). This is deliberately separate from a normal
 * network failure so the UI does not ask a learner to repeatedly retry a save
 * that can only be fixed by a server migration.
 */
export class WordSaveSetupError extends Error {
  constructor() {
    super('Word saving needs a cloud database update before it can continue.');
    this.name = 'WordSaveSetupError';
  }
}

/** The optional bulk collection RPC is unavailable on an older database. */
export class CollectionBatchUnavailableError extends Error {
  constructor() {
    super('Collection batch saving is not available on this database yet.');
    this.name = 'CollectionBatchUnavailableError';
  }
}

/** The account no longer has access to add a curated WordWiz collection. */
export class PremiumCollectionAccessError extends Error {
  constructor() {
    super('WordWiz collections require active Plus access.');
    this.name = 'PremiumCollectionAccessError';
  }
}

export async function getFreeWordUsage(): Promise<FreeWordUsage> {
  const { data, error } = await supabase.rpc('get_free_word_usage');
  if (error) throw new Error(`free_word_usage: ${error.message}`);

  const usage = data as {
    month_key?: unknown;
    words_added?: unknown;
    limit?: unknown;
  } | null;
  return {
    monthKey: typeof usage?.month_key === 'string' ? usage.month_key : getUtcMonthKey(),
    wordsAdded: toSafeCount(usage?.words_added),
    limit: toSafeCount(usage?.limit) || FREE_WORD_LIMIT,
  };
}

export async function createCloudWordWithFreeLimit(word: Word): Promise<Word> {
  const payload = toWordPayload(word);
  let result = await createWordWithMonthlyLimit(payload);

  // A user can leave WordWiz open long enough for their access token to expire.
  // Refresh once and replay the idempotent RPC, rather than incorrectly showing
  // the "not saved" state for a session that can be recovered immediately.
  if (result.error && isSessionError(result.error)) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session) {
      result = await createWordWithMonthlyLimit(payload);
    }
  }

  const { data, error } = result;

  if (error) {
    if (/free_word_limit_reached|free word additions/i.test(errorText(error))) {
      throw new FreeWordLimitError();
    }
    if (
      error.code === '23505' ||
      /duplicate key|unique constraint|words_user_id_lower_term_idx/i.test(errorText(error))
    ) {
      throw new DuplicateWordError();
    }
    if (isWordSaveSetupError(error)) throw new WordSaveSetupError();
    throw new Error(`words: ${error.message}`);
  }

  return mapWordRow(data as WordRow);
}

function createWordWithMonthlyLimit(payload: ReturnType<typeof toWordPayload>) {
  return supabase.rpc('create_word_with_monthly_limit', { p_word: payload });
}

function errorText(error: { message?: string | null; details?: string | null; hint?: string | null }) {
  return [error.message, error.details, error.hint].filter(Boolean).join(' ');
}

function isSessionError(error: { message?: string | null; code?: string | null }) {
  return /jwt expired|invalid jwt|token.*expired|authentication_required/i.test(
    `${error.code ?? ''} ${error.message ?? ''}`,
  );
}

function isWordSaveSetupError(error: {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}) {
  return (
    ['PGRST202', '42P01', '42703', '42883'].includes(error.code ?? '') ||
    /could not find the function|schema cache|relation .* does not exist|column .* does not exist|function .* does not exist/i.test(
      errorText(error),
    )
  );
}

function isCollectionBatchUnavailable(error: {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}) {
  return (
    (error.code === 'PGRST202' || error.code === '42883') &&
    /create_words_with_monthly_limit|could not find the function/i.test(
      errorText(error),
    )
  );
}

/**
 * Creates an optional WordWiz collection in one server transaction. This keeps
 * large starter decks responsive while preserving the server-enforced allowance.
 */
export async function createCloudWordsWithFreeLimit(words: Word[]): Promise<Word[]> {
  if (words.length === 0) return [];

  let result = await supabase.rpc('create_words_with_monthly_limit', {
    p_words: words.map(toWordPayload),
  });

  if (result.error && isSessionError(result.error)) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session) {
      result = await supabase.rpc('create_words_with_monthly_limit', {
        p_words: words.map(toWordPayload),
      });
    }
  }

  const { data, error } = result;

  if (error) {
    if (/free_word_limit_reached|free word additions/i.test(error.message)) {
      throw new FreeWordLimitError();
    }
    if (isCollectionBatchUnavailable(error)) {
      throw new CollectionBatchUnavailableError();
    }
    if (isWordSaveSetupError(error)) throw new WordSaveSetupError();
    throw new Error(`words: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length !== words.length) {
    throw new Error('words: the collection could not be saved completely');
  }

  return (data as WordRow[]).map(mapWordRow);
}

/**
 * Saves an entire WordWiz collection in one transaction, including the study
 * set membership for words the learner had already saved. This is deliberately
 * separate from the legacy per-word path: a collection must never appear only
 * partially added after a network error or a second device changes the library.
 */
export async function createCloudStarterCollection(
  words: Word[],
  existingWordIds: string[],
  membership: StudySetMembership,
): Promise<Word[]> {
  let result = await supabase.rpc('add_starter_collection', {
    p_words: words.map(toWordPayload),
    p_existing_word_ids: existingWordIds,
    p_membership: membership,
  });

  if (result.error && isSessionError(result.error)) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session) {
      result = await supabase.rpc('add_starter_collection', {
        p_words: words.map(toWordPayload),
        p_existing_word_ids: existingWordIds,
        p_membership: membership,
      });
    }
  }

  const { data, error } = result;

  if (error) {
    const message = errorText(error);
    if (/premium_access_required|plus access/i.test(message)) {
      throw new PremiumCollectionAccessError();
    }
    if (/free_word_limit_reached|free word additions/i.test(message)) {
      throw new FreeWordLimitError();
    }
    if (isWordSaveSetupError(error)) throw new WordSaveSetupError();
    throw new Error(`starter_collection: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length !== words.length + existingWordIds.length) {
    throw new Error('starter_collection: the collection could not be saved completely');
  }

  return (data as WordRow[]).map(mapWordRow);
}

/** Updates a deck membership in one cloud request so large decks stay quick to manage. */
export async function saveCloudStudySetMembership(
  wordIds: string[],
  membership: StudySetMembership,
  enabled: boolean,
) {
  if (wordIds.length === 0) return;

  let result = await supabase.rpc('set_study_set_membership', {
    p_word_ids: wordIds,
    p_membership: membership,
    p_enabled: enabled,
  });

  if (result.error && isSessionError(result.error)) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && refreshData.session) {
      result = await supabase.rpc('set_study_set_membership', {
        p_word_ids: wordIds,
        p_membership: membership,
        p_enabled: enabled,
      });
    }
  }

  const { error } = result;

  if (error) {
    if (isWordSaveSetupError(error)) throw new WordSaveSetupError();
    throw new Error(`words: ${error.message}`);
  }
}

export async function syncRevenueCatEntitlement() {
  const { data, error } = await supabase.functions.invoke(
    'revenuecat-sync-entitlement',
    { method: 'POST' },
  );
  if (error) throw new Error(`revenuecat_entitlement_sync: ${error.message}`);
  return data as { plusActive?: boolean } | null;
}

export function getUtcMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

type WordRow = {
  id: string;
  term: string;
  definition: string;
  simple_definition: string | null;
  example: string;
  context_examples?: string[] | null;
  part_of_speech: string | null;
  pronunciation: string | null;
  origin: string | null;
  origin_period: string | null;
  synonyms: string[] | null;
  antonyms?: string[] | null;
  common_words: string[] | null;
  basic_info: string | null;
  reviews: number;
  mastery_data: Word['mastery'] | null;
  is_flagged?: boolean | null;
  flagged_at?: string | null;
  created_at: string;
};

function mapWordRow(row: WordRow): Word {
  return {
    id: row.id,
    term: row.term,
    definition: row.definition,
    simpleDefinition: row.simple_definition ?? undefined,
    example: row.example,
    contextExamples: row.context_examples ?? [],
    partOfSpeech: row.part_of_speech ?? undefined,
    pronunciation: row.pronunciation ?? undefined,
    origin: row.origin ?? undefined,
    originPeriod: row.origin_period ?? undefined,
    synonyms: row.synonyms ?? [],
    antonyms: row.antonyms ?? [],
    commonWords: row.common_words ?? [],
    basicInfo: row.basic_info ?? undefined,
    reviews: row.reviews,
    mastery: row.mastery_data ?? undefined,
    isFlagged: row.is_flagged === true,
    flaggedAt: row.flagged_at ?? undefined,
    createdAt: row.created_at,
  };
}

function toWordPayload(word: Word) {
  return {
    id: word.id,
    term: word.term,
    definition: word.definition,
    simple_definition: word.simpleDefinition ?? null,
    example: word.example,
    context_examples: word.contextExamples ?? [],
    part_of_speech: word.partOfSpeech ?? null,
    pronunciation: word.pronunciation ?? null,
    origin: word.origin ?? null,
    origin_period: word.originPeriod ?? null,
    synonyms: word.synonyms ?? [],
    antonyms: word.antonyms ?? [],
    common_words: word.commonWords ?? [],
    basic_info: word.basicInfo ?? null,
    reviews: word.reviews,
    mastery_data: word.mastery ?? {},
    is_flagged: word.isFlagged === true,
    flagged_at: word.isFlagged ? word.flaggedAt ?? null : null,
  };
}

function toSafeCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
