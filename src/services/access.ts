import { supabase } from './supabase';

const FREE_WORD_LIMIT = 10;

export type ComplimentaryAccess = {
  startedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  startedThisSession: boolean;
  daysRemaining: number;
  monthlyWordsAdded: number;
  monthlyWordLimit: number;
  monthlyWordsRemaining: number;
};

export async function getOrStartComplimentaryAccess(): Promise<ComplimentaryAccess> {
  const { data, error } = await supabase.rpc('get_or_start_my_access');
  if (error) throw new Error(`complimentary_access: ${error.message}`);

  const access = data as Record<string, unknown> | null;
  const limit = toSafeCount(access?.word_limit) || FREE_WORD_LIMIT;
  const wordsAdded = toSafeCount(access?.words_added);
  return {
    startedAt: typeof access?.complimentary_started_at === 'string'
      ? access.complimentary_started_at
      : null,
    expiresAt: typeof access?.complimentary_expires_at === 'string'
      ? access.complimentary_expires_at
      : null,
    isActive: access?.complimentary_active === true,
    startedThisSession: access?.complimentary_started_now === true,
    daysRemaining: toSafeCount(access?.days_remaining),
    monthlyWordsAdded: wordsAdded,
    monthlyWordLimit: limit,
    monthlyWordsRemaining: Math.min(
      limit,
      toSafeCount(access?.words_remaining) || Math.max(0, limit - wordsAdded),
    ),
  };
}

function toSafeCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}
