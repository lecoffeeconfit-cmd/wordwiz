import { env } from '../config/env';
import { cleanLookupWord } from '../utils';
import type { WordnikDefinition } from '../types';

export type WordnikEnrichment = {
  source: 'wordnik';
  word: string;
  wordnik_definitions: WordnikDefinition[];
  wordnik_examples: string[];
  wordnik_pronunciations: string[];
  wordnik_etymology: string[];
  wordnik_related_words: string[];
  wordnik_antonyms: string[];
  wordnik_syllables: string[];
  wordnik_attribution: string[];
  wordnik_url: string;
};

export type WordnikLookupResult =
  | {
      ok: true;
      enrichment: WordnikEnrichment;
      warnings: string[];
    }
  | {
      ok: false;
      reason: WordnikFallbackReason;
      warnings: string[];
    };

type WordnikFallbackReason =
  | 'missing_api_key'
  | 'missing_supabase'
  | 'unauthenticated'
  | 'unauthorized'
  | 'rate_limited'
  | 'server_error'
  | 'timeout'
  | 'network_error'
  | 'empty_result'
  | 'invalid_response';

const WORDNIK_FUNCTION_TIMEOUT_MS = 4500;
const WORDNIK_LOGS_ENABLED =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_WORDWIZ_WORDNIK_LOGS === 'true';

// Wordnik's terms restrict broad/local copies of API data. Keep this cache
// in-memory only so a lookup is not repeated during one app session.
const wordnikSessionCache = new Map<string, Promise<WordnikLookupResult>>();

export async function lookupWordnikEnrichment(
  rawTerm: string,
): Promise<WordnikLookupResult> {
  const lookupTerm = cleanLookupWord(rawTerm);
  if (!lookupTerm) {
    return makeFallback('empty_result');
  }

  if (!env.isSupabaseConfigured) {
    return logAndReturn(lookupTerm, makeFallback('missing_supabase'));
  }

  const cachedLookup = wordnikSessionCache.get(lookupTerm);
  if (cachedLookup) {
    return cachedLookup;
  }

  const lookup = requestWordnikEnrichment(lookupTerm);
  wordnikSessionCache.set(lookupTerm, lookup);
  return lookup;
}

async function requestWordnikEnrichment(
  lookupTerm: string,
): Promise<WordnikLookupResult> {
  try {
    const { supabase } = await import('./supabase');
    const sessionResult = await supabase.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;

    if (!accessToken) {
      return logAndReturn(lookupTerm, makeFallback('unauthenticated'));
    }

    const result = await withTimeout(
      supabase.functions.invoke('wordnik-enrich', {
        body: { word: lookupTerm },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }),
      WORDNIK_FUNCTION_TIMEOUT_MS,
    );

    if (result.error) {
      return logAndReturn(lookupTerm, classifyFunctionError(result.error));
    }

    const data = result.data as unknown;
    if (!isWordnikFunctionResponse(data)) {
      return logAndReturn(lookupTerm, makeFallback('invalid_response'));
    }

    if (!data.ok) {
      return logAndReturn(lookupTerm, {
        ok: false,
        reason: normalizeFallbackReason(data.reason),
        warnings: data.warnings ?? [],
      });
    }

    if (!hasUsefulWordnikData(data.enrichment)) {
      return logAndReturn(lookupTerm, makeFallback('empty_result', data.warnings));
    }

    return logAndReturn(lookupTerm, {
      ok: true,
      enrichment: data.enrichment,
      warnings: data.warnings ?? [],
    });
  } catch (error) {
    return logAndReturn(
      lookupTerm,
      makeFallback(error instanceof TimeoutError ? 'timeout' : 'network_error'),
    );
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new TimeoutError()), timeoutMs);
    }),
  ]);
}

function classifyFunctionError(error: { message?: string }) {
  const message = error.message?.toLowerCase() ?? '';

  if (message.includes('401') || message.includes('403')) {
    return makeFallback('unauthorized');
  }

  if (message.includes('429')) {
    return makeFallback('rate_limited');
  }

  if (message.includes('timeout')) {
    return makeFallback('timeout');
  }

  return makeFallback('network_error');
}

function makeFallback(
  reason: WordnikFallbackReason,
  warnings: string[] = [],
): WordnikLookupResult {
  return {
    ok: false,
    reason,
    warnings,
  };
}

function logAndReturn(lookupTerm: string, result: WordnikLookupResult) {
  if (WORDNIK_LOGS_ENABLED) {
    if (result.ok) {
      console.info('[WordWiz Wordnik] enrichment used', {
        word: lookupTerm,
        warnings: result.warnings,
      });
    } else {
      console.info('[WordWiz Wordnik] fallback used', {
        word: lookupTerm,
        reason: result.reason,
        warnings: result.warnings,
      });
    }
  }

  return result;
}

function isWordnikFunctionResponse(value: unknown): value is
  | {
      ok: true;
      enrichment: WordnikEnrichment;
      warnings?: string[];
    }
  | {
      ok: false;
      reason?: string;
      warnings?: string[];
    } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'ok' in value && typeof (value as { ok?: unknown }).ok === 'boolean';
}

function normalizeFallbackReason(value: unknown): WordnikFallbackReason {
  const allowedReasons = new Set<WordnikFallbackReason>([
    'missing_api_key',
    'missing_supabase',
    'unauthenticated',
    'unauthorized',
    'rate_limited',
    'server_error',
    'timeout',
    'network_error',
    'empty_result',
    'invalid_response',
  ]);

  return typeof value === 'string' &&
    allowedReasons.has(value as WordnikFallbackReason)
    ? (value as WordnikFallbackReason)
    : 'invalid_response';
}

export function hasUsefulWordnikData(enrichment: WordnikEnrichment) {
  return Boolean(
    enrichment.wordnik_definitions?.length ||
      enrichment.wordnik_examples?.length ||
      enrichment.wordnik_pronunciations?.length ||
      enrichment.wordnik_etymology?.length ||
      enrichment.wordnik_related_words?.length ||
      enrichment.wordnik_antonyms?.length ||
      enrichment.wordnik_syllables?.length,
  );
}

class TimeoutError extends Error {
  constructor() {
    super('Wordnik lookup timed out.');
  }
}
