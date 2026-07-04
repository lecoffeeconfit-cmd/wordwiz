import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type WordnikDefinition = {
  text?: string;
  partOfSpeech?: string;
  attributionText?: string;
};

type WordnikExample = {
  text?: string;
};

type WordnikExamplesResponse = {
  examples?: WordnikExample[];
};

type WordnikPronunciation = {
  raw?: string;
  rawType?: string;
};

type WordnikRelatedWords = {
  relationshipType?: string;
  words?: string[];
};

type WordnikSyllable = {
  text?: string;
};

type WordnikEnrichment = {
  source: 'wordnik';
  word: string;
  wordnik_definitions: {
    text: string;
    partOfSpeech?: string;
    attributionText?: string;
  }[];
  wordnik_examples: string[];
  wordnik_pronunciations: string[];
  wordnik_etymology: string[];
  wordnik_related_words: string[];
  wordnik_antonyms: string[];
  wordnik_syllables: string[];
  wordnik_attribution: string[];
  wordnik_url: string;
};

type WordnikFallbackReason =
  | 'missing_api_key'
  | 'unauthenticated'
  | 'unauthorized'
  | 'rate_limited'
  | 'server_error'
  | 'timeout'
  | 'network_error'
  | 'empty_result'
  | 'invalid_response';

type WordnikEndpointResult<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; reason: WordnikFallbackReason; warning: string };

const WORDNIK_API_BASE = 'https://api.wordnik.com/v4/word.json';
const WORDNIK_TIMEOUT_MS = 3500;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, reason: 'invalid_response' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !supabaseAnonKey || !authorization) {
    return jsonResponse({ ok: false, reason: 'unauthenticated' });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ ok: false, reason: 'unauthenticated' });
  }

  const wordnikApiKey = Deno.env.get('WORDNIK_API_KEY');
  if (!wordnikApiKey) {
    return jsonResponse({ ok: false, reason: 'missing_api_key' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, reason: 'invalid_response' }, 400);
  }

  const word = cleanLookupWord(
    typeof body === 'object' && body
      ? (body as { word?: unknown }).word
      : undefined,
  );
  if (!word) {
    return jsonResponse({ ok: false, reason: 'empty_result' });
  }

  const [
    definitions,
    examples,
    pronunciations,
    etymologies,
    relatedWords,
    syllables,
  ] = await Promise.all([
    fetchWordnikJson<WordnikDefinition[]>(
      word,
      'definitions',
      { limit: '5', includeRelated: 'false', useCanonical: 'false' },
      wordnikApiKey,
    ),
    fetchWordnikJson<WordnikExamplesResponse>(
      word,
      'examples',
      { limit: '3', includeDuplicates: 'false', useCanonical: 'false' },
      wordnikApiKey,
    ),
    fetchWordnikJson<WordnikPronunciation[]>(
      word,
      'pronunciations',
      { limit: '5', useCanonical: 'false' },
      wordnikApiKey,
    ),
    fetchWordnikJson<string[]>(
      word,
      'etymologies',
      { useCanonical: 'false' },
      wordnikApiKey,
    ),
    fetchWordnikJson<WordnikRelatedWords[]>(
      word,
      'relatedWords',
      {
        useCanonical: 'false',
        relationshipTypes: 'synonym,same-context,equivalent,antonym',
        limitPerRelationshipType: '8',
      },
      wordnikApiKey,
    ),
    fetchWordnikJson<WordnikSyllable[]>(
      word,
      'hyphenation',
      { useCanonical: 'false' },
      wordnikApiKey,
    ),
  ]);

  const warnings = [
    definitions,
    examples,
    pronunciations,
    etymologies,
    relatedWords,
    syllables,
  ]
    .map((result) => result.warning)
    .filter((warning): warning is string => Boolean(warning));

  const enrichment: WordnikEnrichment = {
    source: 'wordnik',
    word,
    wordnik_definitions: normalizeDefinitions(getData(definitions, [])),
    wordnik_examples: normalizeExamples(getData(examples, { examples: [] })),
    wordnik_pronunciations: normalizePronunciations(getData(pronunciations, [])),
    wordnik_etymology: normalizeStrings(getData(etymologies, [])).slice(0, 3),
    wordnik_related_words: normalizeRelatedWords(getData(relatedWords, [])),
    wordnik_antonyms: normalizeRelatedWords(
      getData(relatedWords, []),
      new Set(['antonym']),
    ),
    wordnik_syllables: normalizeSyllables(getData(syllables, [])),
    wordnik_attribution: normalizeAttribution(getData(definitions, [])),
    wordnik_url: `https://www.wordnik.com/words/${encodeURIComponent(word)}`,
  };

  if (!hasUsefulWordnikData(enrichment)) {
    const primaryFailure = [
      definitions,
      examples,
      pronunciations,
      etymologies,
      relatedWords,
      syllables,
    ].find((result) => !result.ok) as
      | { ok: false; reason: WordnikFallbackReason }
      | undefined;

    return jsonResponse({
      ok: false,
      reason: primaryFailure?.reason ?? 'empty_result',
      warnings,
    });
  }

  return jsonResponse({ ok: true, enrichment, warnings });
});

async function fetchWordnikJson<T>(
  word: string,
  endpoint: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<WordnikEndpointResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORDNIK_TIMEOUT_MS);
  const url = new URL(
    `${WORDNIK_API_BASE}/${encodeURIComponent(word)}/${endpoint}`,
  );

  Object.entries({ ...params, api_key: apiKey }).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 401 || response.status === 403) {
      return endpointFallback('unauthorized', endpoint);
    }

    if (response.status === 429) {
      return endpointFallback('rate_limited', endpoint);
    }

    if (response.status >= 500) {
      return endpointFallback('server_error', endpoint);
    }

    if (!response.ok) {
      return endpointFallback('empty_result', endpoint);
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return endpointFallback(
      error instanceof DOMException && error.name === 'AbortError'
        ? 'timeout'
        : 'network_error',
      endpoint,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function endpointFallback(reason: WordnikFallbackReason, endpoint: string) {
  return {
    ok: false,
    reason,
    warning: `${endpoint}:${reason}`,
  };
}

function getData<T>(result: WordnikEndpointResult<T>, fallback: T) {
  return result.ok ? result.data : fallback;
}

function cleanLookupWord(value: unknown) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';
}

function normalizeDefinitions(definitions: WordnikDefinition[]) {
  return definitions
    .map((definition) => ({
      text: cleanText(definition.text),
      partOfSpeech: cleanText(definition.partOfSpeech),
      attributionText: cleanText(definition.attributionText),
    }))
    .filter((definition) => definition.text)
    .slice(0, 5);
}

function normalizeExamples(response: WordnikExamplesResponse) {
  return normalizeStrings(
    (response.examples ?? []).map((example) => example.text),
  ).slice(0, 3);
}

function normalizePronunciations(pronunciations: WordnikPronunciation[]) {
  return normalizeStrings(
    pronunciations.map((pronunciation) => pronunciation.raw),
  ).slice(0, 3);
}

function normalizeRelatedWords(
  relatedWords: WordnikRelatedWords[],
  relationshipTypes = new Set(['synonym', 'same-context', 'equivalent']),
) {
  return normalizeStrings(
    relatedWords
      .filter((group) =>
        relationshipTypes.has((group.relationshipType ?? '').toLowerCase()),
      )
      .flatMap((group) => group.words ?? []),
  ).slice(0, 10);
}

function normalizeSyllables(syllables: WordnikSyllable[]) {
  return normalizeStrings(syllables.map((syllable) => syllable.text)).slice(
    0,
    12,
  );
}

function normalizeAttribution(definitions: WordnikDefinition[]) {
  return normalizeStrings(
    definitions.map((definition) => definition.attributionText),
  ).slice(0, 5);
}

function normalizeStrings(values: Array<string | undefined>) {
  const seen = new Set<string>();

  return values
    .map(cleanText)
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function cleanText(value?: string) {
  return value?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() ?? '';
}

function hasUsefulWordnikData(enrichment: WordnikEnrichment) {
  return Boolean(
    enrichment.wordnik_definitions.length ||
      enrichment.wordnik_examples.length ||
      enrichment.wordnik_pronunciations.length ||
      enrichment.wordnik_etymology.length ||
      enrichment.wordnik_related_words.length ||
      enrichment.wordnik_antonyms.length ||
      enrichment.wordnik_syllables.length,
  );
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
