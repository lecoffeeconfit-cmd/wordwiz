import type { Word } from '../types';
import { supabase } from './supabase';

export const FREE_WORD_LIMIT = 10;

export type FreeWordUsage = {
  monthKey: string;
  wordsAdded: number;
  limit: number;
};

export type FreeTrialAccess = {
  isActive: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number;
};

export class FreeWordLimitError extends Error {
  constructor() {
    super('You’ve used your 10 free word additions for this month.');
    this.name = 'FreeWordLimitError';
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

export async function getFreeTrialAccess(): Promise<FreeTrialAccess> {
  const { data, error } = await supabase.rpc('get_trial_access');
  if (error) throw new Error(`trial_access: ${error.message}`);

  const trial = data as {
    trial_active?: unknown;
    trial_started_at?: unknown;
    trial_expires_at?: unknown;
    days_remaining?: unknown;
  } | null;

  return {
    isActive: trial?.trial_active === true,
    startedAt: typeof trial?.trial_started_at === 'string'
      ? trial.trial_started_at
      : null,
    expiresAt: typeof trial?.trial_expires_at === 'string'
      ? trial.trial_expires_at
      : null,
    daysRemaining: toSafeCount(trial?.days_remaining),
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
    throw new Error(`words: ${error.message}`);
  }

  return mapWordRow(data as WordRow);
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
