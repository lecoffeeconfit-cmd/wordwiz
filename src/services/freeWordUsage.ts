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
  const { data, error } = await supabase.rpc('create_word_with_monthly_limit', {
    p_word: payload,
  });

  if (error) {
    if (/free_word_limit_reached|free word additions/i.test(error.message)) {
      throw new FreeWordLimitError();
    }
    if (
      error.code === '23505' ||
      /duplicate key|unique constraint|words_user_id_lower_term_idx/i.test(error.message)
    ) {
      throw new DuplicateWordError();
    }
    throw new Error(`words: ${error.message}`);
  }

  return mapWordRow(data as WordRow);
}

/**
 * Creates an optional WordWiz collection in one server transaction. This keeps
 * large starter decks responsive while preserving the server-enforced allowance.
 */
export async function createCloudWordsWithFreeLimit(words: Word[]): Promise<Word[]> {
  if (words.length === 0) return [];

  const { data, error } = await supabase.rpc('create_words_with_monthly_limit', {
    p_words: words.map(toWordPayload),
  });

  if (error) {
    if (/free_word_limit_reached|free word additions/i.test(error.message)) {
      throw new FreeWordLimitError();
    }
    throw new Error(`words: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length !== words.length) {
    throw new Error('words: the collection could not be saved completely');
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

  const { error } = await supabase.rpc('set_study_set_membership', {
    p_word_ids: wordIds,
    p_membership: membership,
    p_enabled: enabled,
  });

  if (error) throw new Error(`words: ${error.message}`);
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
