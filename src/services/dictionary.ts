import type {
  DefinitionOption,
  DictionaryEntry,
  DictionaryMeaning,
  WordDetails,
} from '../types';
import {
  cleanLookupWord,
  buildWordContextExamples,
  fallbackExample,
  getSynonyms,
  inferOriginPeriod,
  makeSimpleDefinition,
} from '../utils';
import { lookupWordnikEnrichment, type WordnikEnrichment } from './wordnik';

type WordSuggestion = {
  word?: string;
  score?: number;
};

type DefinitionSource =
  | 'fallback'
  | 'dictionary'
  | 'wiktionary'
  | 'datamuse'
  | 'wikidata'
  | 'wordnik'
  | 'wikipedia';

export type LookupDefinitionCandidate = {
  text?: string | null;
  source: DefinitionSource;
  partOfSpeech?: string;
  index?: number;
};

type DatamuseWord = {
  word?: string;
  tags?: string[];
  defs?: string[];
  score?: number;
};

type ConceptNetEdge = {
  rel?: { label?: string };
  start?: { label?: string; language?: string };
  end?: { label?: string; language?: string };
  surfaceText?: string;
  weight?: number;
};

type ConceptNetResponse = {
  edges?: ConceptNetEdge[];
};

type WikidataLexemeSearchResponse = {
  search?: {
    id?: string;
    label?: string;
    description?: string;
  }[];
};

type WikidataLexemeEntityResponse = {
  entities?: Record<
    string,
    {
      lemmas?: { en?: { value?: string } };
      senses?: { glosses?: { en?: { value?: string } } }[];
      claims?: Record<
        string,
        {
          mainsnak?: {
            datavalue?: {
              value?: { id?: string };
            };
          };
        }[]
      >;
    }
  >;
};

type WikidataLexemeLookup = {
  definitions: string[];
  partOfSpeech: string;
  history: Pick<WordDetails, 'origin' | 'originPeriod'> | null;
};

type WiktionaryExtractResponse = {
  query?: {
    pages?: Record<
      string,
      {
        extract?: string;
        missing?: boolean;
      }
    >;
  };
};

type WiktionaryDefinition = {
  text: string;
  partOfSpeech?: string;
};

type WiktionaryLookupData = {
  history: Pick<WordDetails, 'origin' | 'originPeriod'> | null;
  definitions: WiktionaryDefinition[];
  partOfSpeech: string;
};

type WikipediaSummaryResponse = {
  type?: string;
  extract?: string;
  description?: string;
};

const WIKIMEDIA_HEADERS = {
  'Api-User-Agent':
    'WordWiz/1.0 (https://github.com/lecoffeeconfit-cmd/wordwiz)',
};

async function fetchWikimediaJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: WIKIMEDIA_HEADERS });
    if (response.ok) {
      return (await response.json()) as T;
    }
  } catch {
    // Some browser runtimes reject custom headers during CORS preflight.
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function lookupWordDetails(rawTerm: string): Promise<WordDetails> {
  const lookupTerm = cleanLookupWord(rawTerm);
  if (!lookupTerm) {
    throw new Error('Type a word first.');
  }

  const [
    dictionaryEntry,
    wiktionaryData,
    datamuseWords,
    conceptNetData,
    wikidataLexeme,
    wikipediaSummary,
    wordnikResult,
  ] = await Promise.all([
    lookupDictionaryEntry(lookupTerm),
    lookupWiktionaryData(lookupTerm),
    lookupDatamuseWords(lookupTerm),
    lookupConceptNet(lookupTerm),
    lookupWikidataLexeme(lookupTerm),
    lookupWikipediaSummary(lookupTerm),
    lookupWordnikEnrichment(lookupTerm),
  ]);
  const wordnik = wordnikResult.ok ? wordnikResult.enrichment : null;
  const fallback = getDefinitionFallback(lookupTerm);

  if (
    !fallback &&
    !dictionaryEntry &&
    !wiktionaryData.definitions.length &&
    !datamuseWords.definitions.length &&
    !datamuseWords.relatedWords.length &&
    !wikidataLexeme.definitions.length &&
    !wikipediaSummary &&
    !wordnik
  ) {
    throw new Error('No dictionary entry found.');
  }

  const entry = dictionaryEntry;
  const meanings = entry?.meanings ?? [];
  const preferred = getPreferredDefinition(meanings, lookupTerm);
  const firstMeaning = preferred?.meaning ?? meanings[0];
  const firstDefinition = preferred?.definition;
  const datamuseDefinition = getDatamuseDefinition(
    datamuseWords.relatedWords,
    lookupTerm,
  );
  const wikidataDefinition = wikidataLexeme.definitions.find((item) =>
    isUsefulDefinition(item, lookupTerm),
  );
  const wikipediaDefinition =
    wikipediaSummary?.extract && isUsefulDefinition(wikipediaSummary.extract, lookupTerm)
      ? wikipediaSummary.extract
      : null;
  const wordnikDefinition = getWordnikDefinition(wordnik, lookupTerm);
  const dictionaryDefinitionCandidates = meanings.flatMap((meaning) =>
    (meaning.definitions ?? []).map((item, index) => ({
      text: item.definition,
      source: 'dictionary' as const,
      partOfSpeech: meaning.partOfSpeech,
      index,
    })),
  );
  const wikidataDefinitionCandidates = wikidataLexeme.definitions.map(
    (text, index) => ({
      text,
      source: 'wikidata' as const,
      partOfSpeech: wikidataLexeme.partOfSpeech,
      index,
    }),
  );
  const wordnikDefinitionCandidates = (wordnik?.wordnik_definitions ?? []).map(
    (item, index) => ({
      text: item.text,
      source: 'wordnik' as const,
      partOfSpeech: item.partOfSpeech,
      index,
    }),
  );
  const definitionCandidates: LookupDefinitionCandidate[] = [
      { text: fallback?.definition, source: 'fallback' },
      {
        text: firstDefinition?.definition,
        source: 'dictionary',
        partOfSpeech: firstMeaning?.partOfSpeech,
      },
      ...dictionaryDefinitionCandidates,
      ...wiktionaryData.definitions.map((item, index) => ({
        text: item.text,
        source: 'wiktionary' as const,
        partOfSpeech: item.partOfSpeech,
        index,
      })),
      ...datamuseWords.definitions.map((text, index) => ({
        text,
        source: 'datamuse' as const,
        index,
      })),
      { text: datamuseDefinition, source: 'datamuse' },
      { text: wikidataDefinition, source: 'wikidata' },
      ...wikidataDefinitionCandidates,
      {
        text: wordnikDefinition?.text,
        source: 'wordnik',
        partOfSpeech: wordnikDefinition?.partOfSpeech,
      },
      ...wordnikDefinitionCandidates,
      { text: wikipediaDefinition, source: 'wikipedia' },
      { text: wikipediaSummary?.extract, source: 'wikipedia' },
    ];
  const definitionOptions = rankDefinitionCandidates(
    definitionCandidates,
    lookupTerm,
  );
  const definition = definitionOptions[0]?.text ?? null;

  if (!definition) {
    throw new Error('No dictionary entry found.');
  }
  const exampleDefinition =
    firstMeaning?.definitions?.find(
      (item) =>
        item.example && !isCircularDefinition(item.example, lookupTerm),
    ) ?? firstDefinition;
  const wordnikExample = wordnik?.wordnik_examples.find((item) =>
    !isCircularDefinition(item, lookupTerm),
  );
  const example =
    fallback?.example ??
    exampleDefinition?.example ??
    wordnikExample ??
    fallbackExample(rawTerm);
  const dictionaryExamples = meanings.flatMap((meaning) =>
    (meaning.definitions ?? []).map((item) => item.example ?? ''),
  );
  const simpleDefinition =
    fallback?.simpleDefinition ?? makeSimpleDefinition(definition, rawTerm);
  const pronunciation =
    entry?.phonetic ??
    entry?.phonetics?.find((phonetic) => phonetic.text)?.text ??
    wordnik?.wordnik_pronunciations[0] ??
    '';
  const synonyms = getSynonymCandidates({
    meanings,
    datamuseWords: datamuseWords.relatedWords,
    conceptNetWords: [
      ...conceptNetData.relatedWords,
      ...(wordnik?.wordnik_related_words ?? []),
    ],
    lookupTerm,
  });
  const antonyms = getAntonymCandidates({
    meanings,
    datamuseWords: datamuseWords.antonyms,
    conceptNetWords: conceptNetData.antonyms,
    wordnikWords: wordnik?.wordnik_antonyms ?? [],
    lookupTerm,
  });
  const partOfSpeech =
    firstMeaning?.partOfSpeech ||
    wiktionaryData.partOfSpeech ||
    getDatamusePartOfSpeech(datamuseWords.relatedWords) ||
    wikidataLexeme.partOfSpeech ||
    wordnikDefinition?.partOfSpeech ||
    '';
  const historyFallback = getHistoryFallback(lookupTerm);
  const historyCandidates = [
    historyFallback
      ? { ...historyFallback, source: 'WordWiz reference', score: 100 }
      : null,
    wiktionaryData.history
      ? { ...wiktionaryData.history, source: 'Wiktionary', score: 85 }
      : null,
    wordnik ? getWordnikHistory(wordnik, lookupTerm) : null,
    wikidataLexeme.history
      ? { ...wikidataLexeme.history, source: 'Wikidata Lexeme', score: 76 }
      : null,
    conceptNetData.history
      ? { ...conceptNetData.history, source: 'ConceptNet', score: 70 }
      : null,
    entry?.origin && !isMissingOrigin(entry.origin)
      ? makeDictionaryOriginHistory({
          lookupTerm,
          partOfSpeech,
          definition,
          sourceOrigin: entry.origin,
          synonyms,
          meaningCount:
            meanings.length ||
            wiktionaryData.definitions.length ||
            (datamuseDefinition || datamuseWords.definitions.length ? 1 : 0),
          score: 65,
        })
      : null,
    makeGenericHistory({
      lookupTerm,
      partOfSpeech,
      definition,
      synonyms,
      antonyms,
      meaningCount:
        meanings.length ||
        wiktionaryData.definitions.length ||
        (datamuseDefinition || datamuseWords.definitions.length ? 1 : 0),
      score: 10,
    }),
  ];
  const history = combineHistorySources(historyCandidates);

  return {
    definition,
    definitionOptions,
    simpleDefinition,
    example,
    contextExamples: buildWordContextExamples({
      term: rawTerm,
      definition,
      example,
      sourceExamples: [
        ...dictionaryExamples,
        ...(wordnik?.wordnik_examples ?? []),
      ],
    }),
    partOfSpeech,
    pronunciation,
    origin: history.origin,
    originPeriod: history.originPeriod,
    synonyms,
    antonyms,
    commonWords: getSynonyms(synonyms),
    basicInfo: [
      partOfSpeech ? `Usually used as a ${partOfSpeech}.` : '',
      meanings.length > 1
        ? `This word has ${meanings.length} common meaning groups.`
        : wiktionaryData.definitions.length > 1
          ? `Wiktionary lists ${wiktionaryData.definitions.length} usable definition senses for this word.`
        : wikidataLexeme.definitions.length > 1
          ? `Wikidata lists ${wikidataLexeme.definitions.length} sense glosses for this word.`
          : 'This word has one main meaning group in this dictionary.',
      synonyms.length ? `Synonyms include ${synonyms.slice(0, 3).join(', ')}.` : '',
      antonyms.length ? `Antonyms include ${antonyms.slice(0, 3).join(', ')}.` : '',
      wikipediaSummary?.description
        ? `Wikipedia context: ${wikipediaSummary.description}.`
        : '',
      wordnik ? makeWordnikAttributionNote(wordnik) : '',
    ]
      .filter(Boolean)
      .join(' '),
    ...(wordnik
      ? {
          wordnik_definitions: wordnik.wordnik_definitions,
          wordnik_examples: wordnik.wordnik_examples,
          wordnik_pronunciations: wordnik.wordnik_pronunciations,
          wordnik_etymology: wordnik.wordnik_etymology,
          wordnik_related_words: wordnik.wordnik_related_words,
          wordnik_antonyms: wordnik.wordnik_antonyms,
          wordnik_syllables: wordnik.wordnik_syllables,
          wordnik_attribution: wordnik.wordnik_attribution,
          wordnik_url: wordnik.wordnik_url,
        }
      : {}),
  };
}

async function lookupDictionaryEntry(lookupTerm: string) {
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
        lookupTerm,
      )}`,
    );

    if (!response.ok) {
      return null;
    }

    const entries = (await response.json()) as DictionaryEntry[];
    return entries[0] ?? null;
  } catch {
    return null;
  }
}

async function lookupDatamuseWords(lookupTerm: string) {
  try {
    const [relatedResponse, antonymResponse, exactResponse] = await Promise.all([
      fetch(
        `https://api.datamuse.com/words?ml=${encodeURIComponent(
          lookupTerm,
        )}&md=dp&max=12`,
      ),
      fetch(
        `https://api.datamuse.com/words?rel_ant=${encodeURIComponent(
          lookupTerm,
        )}&max=8`,
      ),
      fetch(
        `https://api.datamuse.com/words?sp=${encodeURIComponent(
          lookupTerm,
        )}&md=dp&max=4`,
      ),
    ]);

    const relatedWords = relatedResponse.ok
      ? ((await relatedResponse.json()) as DatamuseWord[]).filter(
          (item) => item.word,
        )
      : [];
    const antonyms = antonymResponse.ok
      ? uniqueText(
          ((await antonymResponse.json()) as DatamuseWord[])
            .map((item) => item.word ?? '')
            .filter((word) => itemLooksLikeSynonym(word, lookupTerm)),
        ).slice(0, 8)
      : [];
    const definitions = exactResponse.ok
      ? getDatamuseExactDefinitions(
          (await exactResponse.json()) as DatamuseWord[],
          lookupTerm,
        )
      : [];

    return { relatedWords, antonyms, definitions };
  } catch {
    return { relatedWords: [], antonyms: [], definitions: [] };
  }
}

async function lookupConceptNet(lookupTerm: string) {
  try {
    const response = await fetch(
      `https://api.conceptnet.io/c/en/${encodeURIComponent(
        lookupTerm.replace(/\s+/g, '_'),
      )}?limit=80`,
    );

    if (!response.ok) {
      return { relatedWords: [], antonyms: [], history: null };
    }

    const data = (await response.json()) as ConceptNetResponse;
    const edges = (data.edges ?? []).filter(isEnglishConceptNetEdge);
    const relatedWords = getConceptNetRelatedWords(edges, lookupTerm);
    const antonyms = getConceptNetAntonyms(edges, lookupTerm);
    const history = getConceptNetHistory(edges, lookupTerm);

    return { relatedWords, antonyms, history };
  } catch {
    return { relatedWords: [], antonyms: [], history: null };
  }
}

async function lookupWikidataLexeme(
  lookupTerm: string,
): Promise<WikidataLexemeLookup> {
  try {
    const searchData = await fetchWikimediaJson<WikidataLexemeSearchResponse>(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&uselang=en&type=lexeme&format=json&origin=*&limit=5&search=${encodeURIComponent(
        lookupTerm,
      )}`,
    );

    if (!searchData) return getEmptyWikidataLexemeLookup();

    const lexemeIds = (searchData.search ?? [])
      .filter(
        (item) =>
          item.id &&
          item.label?.toLowerCase() === lookupTerm.toLowerCase() &&
          /english/i.test(item.description ?? ''),
      )
      .map((item) => item.id as string)
      .slice(0, 3);

    if (!lexemeIds.length) {
      return getEmptyWikidataLexemeLookup();
    }

    const entityData = await fetchWikimediaJson<WikidataLexemeEntityResponse>(
      `https://www.wikidata.org/wiki/Special:EntityData/${lexemeIds.join(
        '|',
      )}.json`,
    );

    if (!entityData) return getEmptyWikidataLexemeLookup();

    const definitions = uniqueText(
      Object.values(entityData.entities ?? {}).flatMap((entity) =>
        (entity.senses ?? [])
          .map((sense) => sense.glosses?.en?.value?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).filter((definition) => isUsefulDefinition(definition, lookupTerm));
    const partOfSpeech =
      (searchData.search ?? [])
        .map((item) => item.description ?? '')
        .map(getPartOfSpeechFromDescription)
        .find(Boolean) ?? '';

    const parentLexemeIds = getWikidataParentLexemeIds(entityData);
    const parentEntities = parentLexemeIds.length
      ? await fetchWikimediaJson<WikidataLexemeEntityResponse>(
          `https://www.wikidata.org/wiki/Special:EntityData/${parentLexemeIds.join(
            '|',
          )}.json`,
        )
      : null;

    return {
      definitions,
      partOfSpeech,
      history: getWikidataLexemeHistory(
        lookupTerm,
        parentEntities,
        parentLexemeIds.length,
      ),
    };
  } catch {
    return getEmptyWikidataLexemeLookup();
  }
}

function getEmptyWikidataLexemeLookup(): WikidataLexemeLookup {
  return { definitions: [], partOfSpeech: '', history: null };
}

function getWikidataParentLexemeIds(
  entityData: WikidataLexemeEntityResponse,
) {
  return Array.from(
    new Set(
      Object.values(entityData.entities ?? {})
        .flatMap((entity) => entity.claims?.P5191 ?? [])
        .map((claim) => claim.mainsnak?.datavalue?.value?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ).slice(0, 4);
}

function getWikidataLexemeHistory(
  lookupTerm: string,
  parentEntities: WikidataLexemeEntityResponse | null,
  parentCount: number,
): Pick<WordDetails, 'origin' | 'originPeriod'> | null {
  const parentLemmas = uniqueText(
    Object.values(parentEntities?.entities ?? {})
      .map((entity) => getWikidataLemma(entity))
      .filter((lemma): lemma is string => Boolean(lemma)),
  );

  if (!parentLemmas.length) {
    return parentCount
      ? {
          origin: `Wikidata records a direct lexeme-derivation link for "${toDisplayWord(lookupTerm)}", but the source lemma could not be read from this lookup.`,
          originPeriod:
            'Timeline: Wikidata lexeme data supplied a direct derivation clue. Its etymology links are useful supporting evidence, but coverage is incomplete and this record did not provide a dated timeline.',
        }
      : null;
  }

  return {
    origin: `Wikidata links "${toDisplayWord(lookupTerm)}" to the earlier lexeme${parentLemmas.length === 1 ? '' : 's'} ${parentLemmas.map((lemma) => `“${lemma}”`).join(', ')} through its direct derivation data.`,
    originPeriod:
      'Timeline: Wikidata lexeme data supplied a direct derivation clue. Its etymology links are useful supporting evidence, but coverage is incomplete and this record did not provide a dated timeline.',
  };
}

function getWikidataLemma(
  entity: NonNullable<WikidataLexemeEntityResponse['entities']>[string],
) {
  return entity.lemmas?.en?.value?.trim() ??
    Object.values(entity.lemmas ?? {})
      .map((lemma) => lemma?.value?.trim())
      .find(Boolean);
}

async function lookupWikipediaSummary(lookupTerm: string) {
  try {
    const summary = await fetchWikimediaJson<WikipediaSummaryResponse>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        lookupTerm,
      )}`,
    );

    if (!summary) return null;

    if (
      summary.type === 'disambiguation' ||
      !summary.extract ||
      !summary.extract.toLowerCase().includes(lookupTerm.toLowerCase())
    ) {
      return null;
    }

    return {
      description: summary.description?.trim(),
      extract: cleanEncyclopediaDefinition(summary.extract),
    };
  } catch {
    return null;
  }
}

function getSynonymCandidates({
  meanings,
  datamuseWords,
  conceptNetWords,
  lookupTerm,
}: {
  meanings: DictionaryMeaning[];
  datamuseWords: DatamuseWord[];
  conceptNetWords: string[];
  lookupTerm: string;
}) {
  return Array.from(
    new Set(
      [
        ...meanings.flatMap((meaning) => [
          ...(meaning.synonyms ?? []),
          ...(meaning.definitions ?? []).flatMap(
            (definitionItem) => definitionItem.synonyms ?? [],
          ),
        ]),
        ...datamuseWords
          .map((item) => item.word ?? '')
          .filter((word) =>
            itemLooksLikeSynonym(word, lookupTerm),
          ),
        ...conceptNetWords,
      ].map((word) => word.trim().toLowerCase()),
    ),
  )
    .filter((synonym) => synonym && synonym !== lookupTerm)
    .slice(0, 7);
}

function getAntonymCandidates({
  meanings,
  datamuseWords,
  conceptNetWords,
  wordnikWords,
  lookupTerm,
}: {
  meanings: DictionaryMeaning[];
  datamuseWords: string[];
  conceptNetWords: string[];
  wordnikWords: string[];
  lookupTerm: string;
}) {
  return uniqueText(
    [
      ...meanings.flatMap((meaning) => [
        ...(meaning.antonyms ?? []),
        ...(meaning.definitions ?? []).flatMap(
          (definitionItem) => definitionItem.antonyms ?? [],
        ),
      ]),
      ...datamuseWords,
      ...conceptNetWords,
      ...wordnikWords,
    ]
      .map((word) => word.trim().toLowerCase())
      .filter((word) => itemLooksLikeSynonym(word, lookupTerm)),
  ).slice(0, 7);
}

function itemLooksLikeSynonym(word: string, lookupTerm: string) {
  return (
    Boolean(word) &&
    word.toLowerCase() !== lookupTerm &&
    /^[a-z][a-z '-]*$/i.test(word) &&
    word.length <= 24
  );
}

function getDatamuseDefinition(words: DatamuseWord[], lookupTerm: string) {
  const definition = words
    .flatMap((item) => item.tags ?? [])
    .find((tag) => tag.startsWith('def:'))
    ?.replace(/^def:/, '')
    .trim();

  return definition && isUsefulDefinition(definition, lookupTerm)
    ? definition
    : null;
}

function getDatamuseExactDefinitions(
  words: DatamuseWord[],
  lookupTerm: string,
) {
  const normalizedTerm = lookupTerm.toLowerCase();
  const exactMatches = words.filter(
    (item) => item.word?.trim().toLowerCase() === normalizedTerm,
  );

  return uniqueText(
    exactMatches
      .flatMap((item) => item.defs ?? [])
      .map(cleanDatamuseDefinition)
      .filter((definition) => isUsefulDefinition(definition, lookupTerm)),
  ).slice(0, 4);
}

function cleanDatamuseDefinition(value: string) {
  return value
    .replace(/^[a-z][a-z.]*\t/i, '')
    .replace(/^\s*[a-z][a-z.]*:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getDatamusePartOfSpeech(words: DatamuseWord[]) {
  const tags = words.flatMap((item) => item.tags ?? []);
  if (tags.includes('n')) return 'noun';
  if (tags.includes('v')) return 'verb';
  if (tags.includes('adj')) return 'adjective';
  if (tags.includes('adv')) return 'adverb';
  return '';
}

function getWordnikDefinition(
  wordnik: WordnikEnrichment | null,
  lookupTerm: string,
) {
  return wordnik?.wordnik_definitions.find((definition) =>
    isUsefulDefinition(definition.text, lookupTerm),
  );
}

function getWordnikHistory(
  wordnik: WordnikEnrichment,
  lookupTerm: string,
): HistoryCandidate | null {
  const etymology = wordnik.wordnik_etymology.find(Boolean);
  if (!etymology) {
    return null;
  }

  return {
    source: 'Wordnik',
    score: 82,
    origin: `"${toDisplayWord(lookupTerm)}" history from Wordnik: ${etymology}`,
    originPeriod:
      'Timeline: Wordnik returned an etymology/history note, but not a precise first-use date. Use it as a source clue beside dictionary and Wiktionary evidence.',
  };
}

function makeWordnikAttributionNote(wordnik: WordnikEnrichment) {
  const attributions = wordnik.wordnik_attribution.length
    ? ` Attribution: ${wordnik.wordnik_attribution.join('; ')}.`
    : '';

  return `Wordnik enrichment available. Source: ${wordnik.wordnik_url}.${attributions}`;
}

function isEnglishConceptNetEdge(edge: ConceptNetEdge) {
  return (
    edge.start?.language === 'en' &&
    edge.end?.language === 'en' &&
    Boolean(edge.rel?.label)
  );
}

function getConceptNetRelatedWords(
  edges: ConceptNetEdge[],
  lookupTerm: string,
) {
  const allowedRelations = new Set([
    'Synonym',
    'SimilarTo',
    'RelatedTo',
    'IsA',
    'FormOf',
  ]);

  return uniqueText(
    edges
      .filter((edge) => allowedRelations.has(edge.rel?.label ?? ''))
      .sort((first, second) => (second.weight ?? 0) - (first.weight ?? 0))
      .flatMap((edge) => [edge.start?.label, edge.end?.label])
      .filter((label): label is string => Boolean(label))
      .map(cleanConceptLabel)
      .filter((word) => itemLooksLikeSynonym(word, lookupTerm)),
  ).slice(0, 8);
}

function getConceptNetAntonyms(edges: ConceptNetEdge[], lookupTerm: string) {
  return uniqueText(
    edges
      .filter((edge) => edge.rel?.label === 'Antonym')
      .sort((first, second) => (second.weight ?? 0) - (first.weight ?? 0))
      .flatMap((edge) => [edge.start?.label, edge.end?.label])
      .filter((label): label is string => Boolean(label))
      .map(cleanConceptLabel)
      .filter((word) => itemLooksLikeSynonym(word, lookupTerm)),
  ).slice(0, 8);
}

function getConceptNetHistory(
  edges: ConceptNetEdge[],
  lookupTerm: string,
): Pick<WordDetails, 'origin' | 'originPeriod'> | null {
  const etymologyEdge = edges
    .filter((edge) =>
      /Etymologically|DerivedFrom|FormOf/i.test(edge.rel?.label ?? ''),
    )
    .sort((first, second) => (second.weight ?? 0) - (first.weight ?? 0))
    .find((edge) => edge.surfaceText || edge.end?.label);

  if (!etymologyEdge) {
    return null;
  }

  const displayWord = toDisplayWord(lookupTerm);
  const sourceText =
    etymologyEdge.surfaceText?.replace(/\[\[|\]\]/g, '').trim() ??
    `${displayWord} is connected to ${etymologyEdge.end?.label}.`;

  return {
    origin: `"${displayWord}" has an open lexical relation in ConceptNet: ${sourceText}`,
    originPeriod:
      'Timeline: ConceptNet gives a related-root clue, but not a precise first-use date. Use this as supporting context beside Wiktionary or dictionary origin notes.',
  };
}

function getPartOfSpeechFromDescription(description: string) {
  if (/\bnoun\b/i.test(description)) return 'noun';
  if (/\bverb\b/i.test(description)) return 'verb';
  if (/\badjective\b/i.test(description)) return 'adjective';
  if (/\badverb\b/i.test(description)) return 'adverb';
  return '';
}

function cleanConceptLabel(value: string) {
  return value
    .replace(/^to\s+/i, '')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanEncyclopediaDefinition(value: string) {
  const firstSentence = value.split(/(?<=\.)\s+/)[0]?.trim() ?? value.trim();
  return firstSentence.length > 220
    ? `${firstSentence.slice(0, 217).trim()}...`
    : firstSentence;
}

function uniqueText(values: string[]) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

type HistoryCandidate = Pick<WordDetails, 'origin' | 'originPeriod'> & {
  source: string;
  score: number;
};

function chooseBestHistory(candidates: Array<HistoryCandidate | null>) {
  return candidates
    .filter((candidate): candidate is HistoryCandidate => Boolean(candidate))
    .sort((first, second) => second.score - first.score)[0];
}

function combineHistorySources(candidates: Array<HistoryCandidate | null>) {
  const selected = chooseBestHistory(candidates);
  if (!selected) {
    return makeGenericHistory({
      lookupTerm: 'This word',
      partOfSpeech: 'word',
      definition: '',
      synonyms: [],
      antonyms: [],
      meaningCount: 0,
      score: 0,
    });
  }

  const sourceTrail = Array.from(
    new Set(
      candidates
        .filter((candidate): candidate is HistoryCandidate => Boolean(candidate))
        .map((candidate) => candidate.source)
        .filter((source) => source !== 'WordWiz study note'),
    ),
  );

  return sourceTrail.length > 1
    ? {
        ...selected,
        origin: `${selected.origin} Sources consulted: ${sourceTrail.join(', ')}.`,
      }
    : selected;
}

function makeDictionaryOriginHistory({
  lookupTerm,
  partOfSpeech,
  definition,
  sourceOrigin,
  synonyms,
  meaningCount,
  score,
}: {
  lookupTerm: string;
  partOfSpeech: string;
  definition: string;
  sourceOrigin: string;
  synonyms: string[];
  meaningCount: number;
  score: number;
}): HistoryCandidate {
  const displayWord = toDisplayWord(lookupTerm);
  const speechLabel = partOfSpeech || 'word';
  const rootClue = getRootClue(sourceOrigin);
  const relatedHint = getSynonymHistoryHint(synonyms);

  return {
    source: 'Dictionary API',
    score,
    origin:
      `"${displayWord}" is a ${speechLabel} with this origin note from the dictionary source: ${sourceOrigin}${getMeaningHistoryHint(definition)}${relatedHint}`,
    originPeriod: makeTimeline({
      displayWord,
      rootClue,
      hasSourceOrigin: true,
      meaningCount,
      speechLabel,
    }),
  };
}

function makeGenericHistory({
  lookupTerm,
  partOfSpeech,
  definition,
  synonyms,
  antonyms,
  meaningCount,
  score,
}: {
  lookupTerm: string;
  partOfSpeech: string;
  definition: string;
  synonyms: string[];
  antonyms: string[];
  meaningCount: number;
  score: number;
}): HistoryCandidate {
  const displayWord = toDisplayWord(lookupTerm);
  const speechLabel = partOfSpeech || 'word';
  const rootClue = getInferredRootClue(lookupTerm);
  const patternEstimate = rootClue
    ? ` Estimated word-pattern clue (not a sourced etymology): ${rootClue}`
    : '';

  return {
    source: 'WordWiz study note',
    score,
    origin:
      `"${displayWord}" is listed as a ${speechLabel}${getMeaningHistoryHint(definition)}${getSynonymHistoryHint(synonyms)}${getAntonymHistoryHint(antonyms)}${patternEstimate} A fully sourced older origin was not found, so this note focuses on current meaning and visible word parts.`,
    originPeriod: makeTimeline({
      displayWord,
      rootClue,
      hasSourceOrigin: false,
      meaningCount,
      speechLabel,
    }),
  };
}

function getMeaningHistoryHint(definition: string) {
  return definition
    ? ` Today, it is commonly used to mean "${definition.replace(/\.$/, '')}."`
    : '';
}

function getSynonymHistoryHint(synonyms: string[]) {
  const relatedWords = synonyms.slice(0, 3);
  return relatedWords.length
    ? ` Synonyms include ${relatedWords.join(', ')}.`
    : '';
}

function getAntonymHistoryHint(antonyms: string[]) {
  const oppositeWords = antonyms.slice(0, 3);
  return oppositeWords.length
    ? ` Antonyms include ${oppositeWords.join(', ')}.`
    : '';
}

function getPreferredDefinition(
  meanings: DictionaryMeaning[],
  lookupTerm: string,
) {
  const definitions = meanings.flatMap((meaning) =>
    (meaning.definitions ?? [])
      .filter((definition) => definition.definition?.trim())
      .map((definition, index) => ({ meaning, definition, index })),
  );

  const scoredDefinitions = definitions
    .map((item, index) => {
      const text = cleanLookupDefinitionForDisplay(
        item.definition.definition ?? '',
        lookupTerm,
      );
      if (!isUsefulDefinition(text, lookupTerm)) {
        return null;
      }

      return {
        item,
        score: scoreDefinitionCandidate(
          text,
          lookupTerm,
          {
            source: 'dictionary',
            partOfSpeech: item.meaning.partOfSpeech,
            index,
          },
          index,
        ),
      };
    })
    .filter((item): item is { item: (typeof definitions)[number]; score: number } =>
      Boolean(item),
    )
    .sort((first, second) => second.score - first.score);

  return scoredDefinitions[0]?.item ?? definitions[0];
}

export function selectBestDefinitionForDisplay(
  candidates: LookupDefinitionCandidate[],
  lookupTerm: string,
) {
  return rankDefinitionCandidates(candidates, lookupTerm)[0]?.text ?? null;
}

export function rankDefinitionCandidates(
  candidates: LookupDefinitionCandidate[],
  lookupTerm: string,
): DefinitionOption[] {
  const scoredCandidates = candidates
    .map((candidate, index) => {
      const text = cleanLookupDefinitionForDisplay(
        candidate.text ?? '',
        lookupTerm,
      );
      if (!isUsefulDefinition(text, lookupTerm)) {
        return null;
      }

      return {
        text,
        source: candidate.source,
        partOfSpeech: candidate.partOfSpeech,
        index,
        score: scoreDefinitionCandidate(text, lookupTerm, candidate, index),
      };
    })
    .filter(
      (item): item is {
        text: string;
        source: DefinitionSource;
        partOfSpeech: string | undefined;
        index: number;
        score: number;
      } => Boolean(item),
    )
    .sort(
      (first, second) =>
        second.score - first.score || first.index - second.index,
    );

  const uniqueCandidates = scoredCandidates.filter(
    (candidate, index, allCandidates) =>
      allCandidates.findIndex(
        (item) => normalizeDefinitionText(item.text) === normalizeDefinitionText(candidate.text),
      ) === index,
  );

  return prioritizeDefinitionSourceDiversity(uniqueCandidates)
    .slice(0, 7)
    .map((candidate, index) => ({
    text: candidate.text,
    source: getDefinitionSourceLabel(candidate.source),
    partOfSpeech: candidate.partOfSpeech,
    recommended: index === 0,
    }));
}

function prioritizeDefinitionSourceDiversity<
  T extends { source: DefinitionSource },
>(candidates: T[]) {
  const prioritized: T[] = [];
  const includedSources = new Set<DefinitionSource>();

  candidates.forEach((candidate) => {
    if (!includedSources.has(candidate.source)) {
      prioritized.push(candidate);
      includedSources.add(candidate.source);
    }
  });

  candidates.forEach((candidate) => {
    if (!prioritized.includes(candidate)) {
      prioritized.push(candidate);
    }
  });

  return prioritized;
}

function normalizeDefinitionText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getDefinitionSourceLabel(source: DefinitionSource) {
  const labels: Record<DefinitionSource, string> = {
    fallback: 'WordWiz',
    dictionary: 'Dictionary API',
    wiktionary: 'Wiktionary',
    datamuse: 'Datamuse / WordNet',
    wikidata: 'Wikidata',
    wordnik: 'Wordnik',
    wikipedia: 'Wikipedia',
  };

  return labels[source];
}

function scoreDefinitionCandidate(
  text: string,
  lookupTerm: string,
  candidate: LookupDefinitionCandidate,
  fallbackIndex: number,
) {
  const sourceWeights: Record<DefinitionSource, number> = {
    fallback: 100,
    dictionary: 70,
    wiktionary: 68,
    wikidata: 64,
    wordnik: 60,
    wikipedia: 58,
    datamuse: 48,
  };
  const source = candidate.source;
  const sourceIndex = candidate.index ?? fallbackIndex;
  const normalized = text.toLowerCase();
  const wordCount = countDefinitionWords(text);
  let score = sourceWeights[source] ?? 0;

  if (wordCount >= 5 && wordCount <= 28) score += 14;
  if (wordCount > 38) score -= 8;
  if (/^(?:a|an|the)\s+/i.test(text)) score += 5;
  if (
    /\b(?:device|machine|tool|system|process|fruit|plant|animal|food|object|substance|quality|state|act|place|person)\b/i.test(
      text,
    )
  ) {
    score += 6;
  }
  if (/\b(?:electronic|digital|programmable|software|hardware|data|information)\b/i.test(text)) {
    score += 12;
  }
  if (candidate.partOfSpeech && normalized.includes(candidate.partOfSpeech)) {
    score += 2;
  }
  if (/\b(?:obsolete|archaic|dated|historical|formerly)\b/i.test(text)) {
    score -= 35;
  }
  if (/\b(?:person employed to perform computations|one who computes)\b/i.test(text)) {
    score -= 60;
  }
  if (lookupTerm === 'computer' && /\b(?:computations|computes)\b/i.test(text)) {
    score -= 20;
  }

  return score - Math.min(sourceIndex, 12) * 2;
}

export function cleanLookupDefinitionForDisplay(
  value: string,
  lookupTerm: string,
) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '';
  }

  const term = lookupTerm.trim();
  if (!term || !startsWithLookupTerm(cleaned, term)) {
    return cleaned;
  }

  const opening = cleaned.slice(0, 160);
  const leadIn = opening.match(
    /\b(?:is|are|refers to|means|describes)\b\s+/i,
  );
  if (!leadIn?.index) {
    return cleaned;
  }

  const definitionStart = leadIn.index + leadIn[0].length;
  const rewritten = cleaned.slice(definitionStart).trim();

  return rewritten ? capitalizeDefinition(rewritten) : cleaned;
}

function isUsefulDefinition(value: string, lookupTerm: string) {
  const text = value.trim();
  if (!text) {
    return false;
  }

  if (
    /did not provide a full dictionary definition|a meaning for .+ was found/i.test(
      text,
    )
  ) {
    return false;
  }

  if (
    /\b(?:misspelling|nonstandard spelling|alternative spelling|obsolete spelling)\s+of\b/i.test(
      text,
    )
  ) {
    return false;
  }

  if (isCircularDefinition(text, lookupTerm)) {
    return false;
  }

  if (/^to\s+[a-z'-]+\.?$/i.test(text)) {
    return false;
  }

  return hasEnoughDefinitionWords(text);
}

function hasEnoughDefinitionWords(value: string) {
  return countDefinitionWords(value) >= 3;
}

function countDefinitionWords(value: string) {
  return value.replace(/[^\w\s'-]/g, '').split(/\s+/).filter(Boolean).length;
}

function isCircularDefinition(value: string, lookupTerm: string) {
  const term = lookupTerm.trim();
  if (!term) {
    return false;
  }

  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(value);
}

function startsWithLookupTerm(value: string, lookupTerm: string) {
  return new RegExp(`^\\s*${escapeRegExp(lookupTerm)}\\b`, 'i').test(value);
}

function capitalizeDefinition(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function getDefinitionFallback(lookupTerm: string): Partial<WordDetails> | null {
  if (lookupTerm === 'banana') {
    return {
      definition:
        'A long curved fruit with soft sweet flesh and a yellow skin when ripe.',
      simpleDefinition: 'A long yellow fruit that is soft and sweet inside.',
      example: 'She sliced a banana onto her cereal.',
    };
  }

  if (lookupTerm === 'computer') {
    return {
      definition:
        'An electronic machine that stores, retrieves, and processes information according to instructions.',
      simpleDefinition: 'An electronic machine that works with information.',
      example: 'The computer saved her school project.',
    };
  }

  if (lookupTerm === 'run') {
    return {
      definition:
        'To move quickly on foot; also to operate, manage, or continue working.',
      simpleDefinition: 'To move fast or make something work.',
      example: 'She likes to run before school, and her watch can run for days.',
    };
  }

  if (lookupTerm === 'sober') {
    return {
      definition:
        'Not drunk or affected by alcohol; also serious, calm, and clear-minded.',
      simpleDefinition: 'Not drunk; serious and clear-minded.',
      example: 'She stayed sober at the party so she could drive home safely.',
    };
  }

  return null;
}

export function getDefinitionFallbackForTest(lookupTerm: string) {
  return getDefinitionFallback(lookupTerm);
}

function getHistoryFallback(lookupTerm: string): Partial<WordDetails> | null {
  if (lookupTerm === 'serendipity') {
    return {
      origin:
        'The noun "serendipity" was coined by Horace Walpole in 1754 after the tale The Three Princes of Serendip, whose characters made fortunate discoveries by observation and chance. "Serendip" is an older name associated with Sri Lanka, passing through Persian and Arabic forms from Sanskrit roots meaning island of Sinhala.',
      originPeriod:
        'Timeline: Ancient Sanskrit roots named the island linked with Sri Lanka. Medieval Persian and Arabic forms helped preserve the place name Serendip. 1754 - Horace Walpole coined "serendipity" in English. Later use narrowed toward happy accidental discovery.',
    };
  }

  if (lookupTerm === 'run') {
    return {
      origin:
        'The verb "run" comes from Old English roots meaning to run, flow, hurry, or move along a course. The modern word merged ideas from rinnan, meaning "to run or flow," and aernan/earnan, meaning "to make run" or "reach by running." These forms connect to older Germanic words for running and flowing.',
      originPeriod:
        'Timeline: Old English before 1150 - used for moving quickly and for flowing water. Middle English 1150-1500 - related forms merged into the modern word. 1300s - used for direction, course, and continuing over time. 1560s - used for machinery operating. 1826 - used for running for office. 1861 - used for managing a business.',
    };
  }

  if (lookupTerm === 'sober') {
    return {
      origin:
        'The adjective "sober" entered English through Old French sobre, from Latin sobrius, meaning not drunk, temperate, moderate, or sensible. The Latin idea combines "without" with a word for drunkenness.',
      originPeriod:
        'Timeline: 1100s - Old French sobre meant decent or sober. Mid-1300s - English used sober for temperate, restrained, calm, or abstaining from strong drink. Late 1300s - used for not drunk at the moment and also serious or solemn. 1590s - extended to plain or simple colors.',
    };
  }

  return null;
}

async function lookupWiktionaryData(
  lookupTerm: string,
): Promise<WiktionaryLookupData> {
  try {
    const data = await fetchWikimediaJson<WiktionaryExtractResponse>(
      `https://en.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(
        lookupTerm,
      )}`,
    );

    if (!data) return getEmptyWiktionaryLookupData();

    const page = Object.values(data.query?.pages ?? {}).find(
      (item) => item.extract && !item.missing,
    );
    const extract = page?.extract ?? '';
    const etymology = getWiktionaryEtymology(extract);
    const definitionLookup = getWiktionaryDefinitionLookup(extract, lookupTerm);

    if (!etymology) {
      return { history: null, ...definitionLookup };
    }

    const displayWord = toDisplayWord(lookupTerm);
    const timeClues = getTimeClues(etymology);
    const periodText = timeClues.length
      ? timeClues.join('; ')
      : 'exact dates are not clear in the source text';

    return {
      history: {
        origin: `"${displayWord}" history from Wiktionary: ${etymology}`,
        originPeriod: `Timeline: ${makeTimelineLead(timeClues)} Source - Wiktionary etymology. Evidence - ${periodText}. Learning note - older word histories often show roots first, then how English usage changed over time.`,
      },
      ...definitionLookup,
    };
  } catch {
    return getEmptyWiktionaryLookupData();
  }
}

function getEmptyWiktionaryLookupData(): WiktionaryLookupData {
  return { history: null, definitions: [], partOfSpeech: '' };
}

export function getWiktionaryEtymologyForTest(extract: string) {
  return getWiktionaryEtymology(extract);
}

export function getWiktionaryDefinitionLookupForTest(
  extract: string,
  lookupTerm: string,
) {
  return getWiktionaryDefinitionLookup(extract, lookupTerm);
}

function getWiktionaryDefinitionLookup(
  extract: string,
  lookupTerm: string,
): Pick<WiktionaryLookupData, 'definitions' | 'partOfSpeech'> {
  const englishText = getEnglishExtract(extract);
  if (!englishText) {
    return { definitions: [], partOfSpeech: '' };
  }

  const definitions: WiktionaryDefinition[] = [];
  let currentPartOfSpeech = '';

  englishText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const heading = getWiktionaryHeadingName(line);
      if (heading) {
        currentPartOfSpeech = getWiktionaryPartOfSpeech(heading);
        return;
      }

      if (!currentPartOfSpeech) {
        return;
      }

      const definition = getWiktionaryDefinitionLine(line, lookupTerm);
      if (definition) {
        definitions.push({
          text: definition,
          partOfSpeech: currentPartOfSpeech,
        });
      }
    });

  const uniqueDefinitions = uniqueText(definitions.map((item) => item.text)).map(
    (text) => ({
      text,
      partOfSpeech: definitions.find((item) => item.text === text)?.partOfSpeech,
    }),
  );

  return {
    definitions: uniqueDefinitions,
    partOfSpeech: uniqueDefinitions[0]?.partOfSpeech ?? '',
  };
}

function getWiktionaryHeadingName(line: string) {
  const markedHeading = line.match(/^=+\s*([^=]+?)\s*=+$/);
  if (markedHeading) {
    return markedHeading[1]?.trim() ?? '';
  }

  const bareHeading = line.match(
    /^(English|Etymology(?:\s+\d+)?|Pronunciation|Noun(?:\s+\d+)?|Verb(?:\s+\d+)?|Adjective(?:\s+\d+)?|Adverb(?:\s+\d+)?|Interjection|Preposition|Conjunction|Determiner|Pronoun|Proper noun|Synonyms|Antonyms|Derived terms|Related terms|Descendants|Translations|References|Further reading|Anagrams)$/i,
  );

  return bareHeading?.[1]?.trim() ?? '';
}

function getWiktionaryPartOfSpeech(heading: string) {
  const normalizedHeading = heading.replace(/\s+\d+$/, '').toLowerCase();
  const headings: Record<string, string> = {
    noun: 'noun',
    verb: 'verb',
    adjective: 'adjective',
    adverb: 'adverb',
    interjection: 'interjection',
    preposition: 'preposition',
    conjunction: 'conjunction',
    determiner: 'determiner',
    pronoun: 'pronoun',
    'proper noun': 'proper noun',
  };

  return headings[normalizedHeading] ?? '';
}

function getWiktionaryDefinitionLine(line: string, lookupTerm: string) {
  const match = line.match(/^#\s*(?![#*:;])(.+)/);
  if (!match) {
    return null;
  }

  const cleaned = cleanWiktionaryDefinitionText(match[1] ?? '');
  return isUsefulDefinition(cleaned, lookupTerm) ? cleaned : null;
}

function cleanWiktionaryDefinitionText(value: string) {
  return value
    .replace(/^\((?:[^)]{1,40})\)\s*/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/\[\[|\]\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWiktionaryEtymology(extract: string) {
  const englishText = getEnglishExtract(extract);
  if (!englishText) {
    return null;
  }

  const lines = englishText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const etymologyIndex = lines.findIndex((line) =>
    /^=*\s*Etymology(?:\s+\d+)?\s*=*$/i.test(line),
  );

  if (etymologyIndex < 0) {
    return null;
  }

  const historyLines: string[] = [];
  for (const line of lines.slice(etymologyIndex + 1)) {
    if (isWiktionaryStopHeading(line)) {
      break;
    }
    historyLines.push(line);
  }

  return cleanHistoryText(historyLines.join(' '));
}

function getEnglishExtract(extract: string) {
  const englishMatch = extract.match(/(?:^|\n)=*\s*English\s*=*\n([\s\S]*)/);
  if (!englishMatch) {
    return extract;
  }

  const afterEnglish = englishMatch[1];
  const nextLanguageIndex = afterEnglish.search(
    /\n=*\s*(?:Afrikaans|Arabic|Chinese|Dutch|French|German|Greek|Italian|Japanese|Latin|Middle English|Old English|Portuguese|Russian|Spanish|Swedish|Welsh)\s*=*\n/,
  );

  return nextLanguageIndex >= 0
    ? afterEnglish.slice(0, nextLanguageIndex)
    : afterEnglish;
}

function isWiktionaryStopHeading(line: string) {
  return /^=*\s*(Pronunciation|Noun|Verb|Adjective|Adverb|Interjection|Preposition|Conjunction|Determiner|Article|Particle|Numeral|Synonyms|Antonyms|Derived terms|Related terms|Descendants|Translations|References|Further reading|Anagrams|Etymology\s+\d+)\s*=*$/i.test(
    line,
  );
}

function cleanHistoryText(value: string) {
  const cleaned = value
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\([^)]*please add[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 20) {
    return null;
  }

  return cleaned.length > 430 ? `${cleaned.slice(0, 427).trim()}...` : cleaned;
}

function getTimeClues(text: string) {
  const patterns = [
    /\bOld English\b/gi,
    /\bMiddle English\b/gi,
    /\bEarly Modern English\b/gi,
    /\b(?:\d{1,2}(?:st|nd|rd|th)\s+century)\b/gi,
    /\b(?:1[0-9]{3}s|[2-9][0-9]{2}s)\b/g,
    /\b(?:from|since|by|attested)\s+(?:c\.\s*)?\d{3,4}\b/gi,
  ];
  const clues = patterns.flatMap((pattern) => text.match(pattern) ?? []);

  return Array.from(new Set(clues.map((clue) => clue.trim()))).slice(0, 5);
}

function makeTimelineLead(timeClues: string[]) {
  if (!timeClues.length) {
    return 'Date unknown - the source gives word-history clues but no clear first-use year.';
  }

  const firstYear = timeClues.find((clue) =>
    /\b(?:\d{3,4}|1[0-9]{3}s|[2-9][0-9]{2}s)\b/.test(clue),
  );
  if (firstYear) {
    return `Earliest clear date clue - ${firstYear}.`;
  }

  const firstPeriod = timeClues.find((clue) =>
    /Old English|Middle English|Early Modern English|century/i.test(clue),
  );
  if (firstPeriod) {
    return `Earliest clear period clue - ${formatPeriodClue(firstPeriod)}.`;
  }

  return `Date clue - ${timeClues[0]}.`;
}

function formatPeriodClue(clue: string) {
  if (/Old English/i.test(clue)) {
    return 'Old English, roughly 450-1150 CE';
  }
  if (/Middle English/i.test(clue)) {
    return 'Middle English, roughly 1150-1500 CE';
  }
  if (/Early Modern English/i.test(clue)) {
    return 'Early Modern English, roughly 1500-1700 CE';
  }

  return clue;
}

function makeTimeline({
  displayWord,
  rootClue,
  hasSourceOrigin,
  meaningCount,
  speechLabel,
}: {
  displayWord: string;
  rootClue: string | null;
  hasSourceOrigin: boolean;
  meaningCount: number;
  speechLabel: string;
}) {
  const periodLine = getTimelinePeriodLine(rootClue, hasSourceOrigin);
  const sourceLine = hasSourceOrigin
    ? 'Source note - the dictionary included an origin clue for this word.'
    : 'Source note - live sources did not return a complete older-origin entry.';
  const rootLine = rootClue
    ? `Root clue - ${rootClue}`
    : 'Root clue - exact roots are not available from this lookup.';
  const meaningLine =
    meaningCount > 1
      ? `Modern use - "${displayWord}" has ${meaningCount} meaning groups, so it may change meaning by context.`
      : `Modern use - "${displayWord}" is listed as a ${speechLabel} with one main meaning group.`;

  return `Timeline: ${periodLine} ${sourceLine} ${rootLine} Learning note - older word histories often combine roots, borrowing, and later meaning changes. ${meaningLine}`;
}

function getTimelinePeriodLine(rootClue: string | null, hasSourceOrigin: boolean) {
  if (!rootClue) {
    return hasSourceOrigin
      ? 'Date unknown - this source has an origin clue but no clear first-use year.'
      : 'Date unknown - no reliable older-origin date was returned.';
  }

  const explicitDate = rootClue.match(
    /\b(?:\d{1,2}(?:st|nd|rd|th)\s+century|1[0-9]{3}s|[2-9][0-9]{2}s|\d{3,4}\s*CE|before\s+\d{3,4}|after\s+\d{3,4})\b/i,
  )?.[0];

  if (explicitDate) {
    return `Earliest clear period clue - ${explicitDate}.`;
  }

  if (/Old English/i.test(rootClue)) {
    return 'Earliest clear period clue - Old English, roughly 450-1150 CE.';
  }
  if (/Middle English/i.test(rootClue)) {
    return 'Earliest clear period clue - Middle English, roughly 1150-1500 CE.';
  }
  if (/Early Modern English/i.test(rootClue)) {
    return 'Earliest clear period clue - Early Modern English, roughly 1500-1700 CE.';
  }
  if (/Latin|Greek|French|Germanic|Sanskrit/i.test(rootClue)) {
    return 'Older roots clue - source points to an older language family, but not a precise English first-use year.';
  }

  return 'Date unknown - source gives a root clue but no clear year.';
}

function getInferredRootClue(lookupTerm: string) {
  const clues: { pattern: RegExp; text: string }[] = [
    {
      pattern: /tion$/,
      text: 'the ending "-tion" often marks a noun for an action, state, or result, commonly through Latin and French influence.',
    },
    {
      pattern: /ity$/,
      text: 'the ending "-ity" often marks a quality or state, commonly from Latin-derived English word formation.',
    },
    {
      pattern: /ology$/,
      text: 'the ending "-ology" usually points to Greek-derived word formation meaning a field of study.',
    },
    {
      pattern: /^un/,
      text: 'the prefix "un-" often means not or reversal in English word formation.',
    },
    {
      pattern: /^re/,
      text: 'the prefix "re-" often means again or back in Latin-derived English word formation.',
    },
    {
      pattern: /^pre/,
      text: 'the prefix "pre-" often means before in Latin-derived English word formation.',
    },
  ];

  return clues.find((clue) => clue.pattern.test(lookupTerm))?.text ?? null;
}

function getRootClue(sourceOrigin?: string) {
  if (!sourceOrigin || isMissingOrigin(sourceOrigin)) {
    return null;
  }

  const period = inferOriginPeriod(sourceOrigin);
  if (!period.startsWith('Time period not available')) {
    return period;
  }

  return 'the source gives an origin note, but not a clear time period.';
}

function isMissingOrigin(value: string) {
  return /did not include|not available|unknown/i.test(value);
}

function toDisplayWord(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function suggestWordSpellings(rawTerm: string) {
  const lookupTerm = cleanLookupWord(rawTerm);
  if (!lookupTerm || lookupTerm.length < 2) {
    return [];
  }

  const [suggestions, spelledLike] = await Promise.allSettled([
    fetchWordSuggestions(
      `https://api.datamuse.com/sug?s=${encodeURIComponent(lookupTerm)}&max=6`,
    ),
    fetchWordSuggestions(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(lookupTerm)}&max=6`,
    ),
  ]);

  return uniqueSuggestions([
    ...(suggestions.status === 'fulfilled' ? suggestions.value : []),
    ...(spelledLike.status === 'fulfilled' ? spelledLike.value : []),
  ])
    .filter((suggestion) => suggestion.toLowerCase() !== lookupTerm.toLowerCase())
    .slice(0, 4);
}

async function fetchWordSuggestions(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    return [];
  }

  const words = (await response.json()) as WordSuggestion[];
  return words
    .map((item) => item.word?.trim())
    .filter((word): word is string => Boolean(word))
    .filter((word) => /^[A-Za-z][A-Za-z '-]*$/.test(word));
}

function uniqueSuggestions(words: string[]) {
  const seen = new Set<string>();

  return words.filter((word) => {
    const key = word.toLowerCase();
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
