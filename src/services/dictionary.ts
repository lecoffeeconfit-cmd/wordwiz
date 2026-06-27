import type {
  DictionaryEntry,
  DictionaryMeaning,
  WordDetails,
} from '../types';
import {
  cleanLookupWord,
  fallbackExample,
  getSynonyms,
  inferOriginPeriod,
  makeSimpleDefinition,
} from '../utils';

type WordSuggestion = {
  word?: string;
  score?: number;
};

type DatamuseWord = {
  word?: string;
  tags?: string[];
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
    }
  >;
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
    wiktionaryHistory,
    datamuseWords,
    conceptNetData,
    wikidataLexeme,
    wikipediaSummary,
  ] = await Promise.all([
    lookupDictionaryEntry(lookupTerm),
    lookupWiktionaryHistory(lookupTerm),
    lookupDatamuseWords(lookupTerm),
    lookupConceptNet(lookupTerm),
    lookupWikidataLexeme(lookupTerm),
    lookupWikipediaSummary(lookupTerm),
  ]);

  if (
    !dictionaryEntry &&
    !datamuseWords.length &&
    !wikidataLexeme.definitions.length &&
    !wikipediaSummary
  ) {
    throw new Error('No dictionary entry found.');
  }

  const entry = dictionaryEntry;
  const meanings = entry?.meanings ?? [];
  const fallback = getDefinitionFallback(lookupTerm);
  const preferred = getPreferredDefinition(meanings, lookupTerm);
  const firstMeaning = preferred?.meaning ?? meanings[0];
  const firstDefinition = preferred?.definition;
  const datamuseDefinition = getDatamuseDefinition(datamuseWords, lookupTerm);
  const wikidataDefinition = wikidataLexeme.definitions.find((item) =>
    isUsefulDefinition(item, lookupTerm),
  );
  const wikipediaDefinition =
    wikipediaSummary?.extract && isUsefulDefinition(wikipediaSummary.extract, lookupTerm)
      ? wikipediaSummary.extract
      : null;
  const definition =
    fallback?.definition ??
    (firstDefinition?.definition &&
    isUsefulDefinition(firstDefinition.definition, lookupTerm)
      ? firstDefinition.definition
      : datamuseDefinition ??
        wikidataDefinition ??
        firstDefinition?.definition ??
        wikipediaDefinition ??
        '');
  const exampleDefinition =
    firstMeaning?.definitions?.find(
      (item) =>
        item.example && !isCircularDefinition(item.example, lookupTerm),
    ) ?? firstDefinition;
  const example = fallback?.example ?? exampleDefinition?.example ?? fallbackExample(rawTerm);
  const simpleDefinition =
    fallback?.simpleDefinition ?? makeSimpleDefinition(definition, rawTerm);
  const pronunciation =
    entry?.phonetic ??
    entry?.phonetics?.find((phonetic) => phonetic.text)?.text ??
    '';
  const synonyms = getSynonymCandidates({
    meanings,
    datamuseWords,
    conceptNetWords: conceptNetData.relatedWords,
    lookupTerm,
  });
  const partOfSpeech =
    firstMeaning?.partOfSpeech ||
    getDatamusePartOfSpeech(datamuseWords) ||
    wikidataLexeme.partOfSpeech;
  const historyFallback = getHistoryFallback(lookupTerm);
  const history = chooseBestHistory([
    historyFallback ? { ...historyFallback, score: 100 } : null,
    wiktionaryHistory ? { ...wiktionaryHistory, score: 85 } : null,
    conceptNetData.history ? { ...conceptNetData.history, score: 70 } : null,
    entry?.origin && !isMissingOrigin(entry.origin)
      ? makeDictionaryOriginHistory({
          lookupTerm,
          partOfSpeech,
          definition,
          sourceOrigin: entry.origin,
          synonyms,
          meaningCount: meanings.length || (datamuseDefinition ? 1 : 0),
          score: 65,
        })
      : null,
    makeGenericHistory({
      lookupTerm,
      partOfSpeech,
      definition,
      synonyms,
      meaningCount: meanings.length || (datamuseDefinition ? 1 : 0),
      score: 10,
    }),
  ]);

  return {
    definition,
    simpleDefinition,
    example,
    partOfSpeech,
    pronunciation,
    origin: history.origin,
    originPeriod: history.originPeriod,
    synonyms,
    commonWords: getSynonyms(synonyms),
    basicInfo: [
      partOfSpeech ? `Usually used as a ${partOfSpeech}.` : '',
      meanings.length > 1
        ? `This word has ${meanings.length} common meaning groups.`
        : wikidataLexeme.definitions.length > 1
          ? `Wikidata lists ${wikidataLexeme.definitions.length} sense glosses for this word.`
          : 'This word has one main meaning group in this dictionary.',
      synonyms.length ? `Synonyms include ${synonyms.slice(0, 3).join(', ')}.` : '',
      wikipediaSummary?.description
        ? `Wikipedia context: ${wikipediaSummary.description}.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
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
    const response = await fetch(
      `https://api.datamuse.com/words?ml=${encodeURIComponent(
        lookupTerm,
      )}&md=dp&max=12`,
    );

    if (!response.ok) {
      return [];
    }

    const words = (await response.json()) as DatamuseWord[];
    return words.filter((item) => item.word);
  } catch {
    return [];
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
      return { relatedWords: [], history: null };
    }

    const data = (await response.json()) as ConceptNetResponse;
    const edges = (data.edges ?? []).filter(isEnglishConceptNetEdge);
    const relatedWords = getConceptNetRelatedWords(edges, lookupTerm);
    const history = getConceptNetHistory(edges, lookupTerm);

    return { relatedWords, history };
  } catch {
    return { relatedWords: [], history: null };
  }
}

async function lookupWikidataLexeme(lookupTerm: string) {
  try {
    const searchData = await fetchWikimediaJson<WikidataLexemeSearchResponse>(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&language=en&uselang=en&type=lexeme&format=json&origin=*&limit=5&search=${encodeURIComponent(
        lookupTerm,
      )}`,
    );

    if (!searchData) return { definitions: [], partOfSpeech: '' };

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
      return { definitions: [], partOfSpeech: '' };
    }

    const entityData = await fetchWikimediaJson<WikidataLexemeEntityResponse>(
      `https://www.wikidata.org/wiki/Special:EntityData/${lexemeIds.join(
        '|',
      )}.json`,
    );

    if (!entityData) return { definitions: [], partOfSpeech: '' };

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

    return { definitions, partOfSpeech };
  } catch {
    return { definitions: [], partOfSpeech: '' };
  }
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

function getDatamusePartOfSpeech(words: DatamuseWord[]) {
  const tags = words.flatMap((item) => item.tags ?? []);
  if (tags.includes('n')) return 'noun';
  if (tags.includes('v')) return 'verb';
  if (tags.includes('adj')) return 'adjective';
  if (tags.includes('adv')) return 'adverb';
  return '';
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
  score: number;
};

function chooseBestHistory(candidates: Array<HistoryCandidate | null>) {
  return candidates
    .filter((candidate): candidate is HistoryCandidate => Boolean(candidate))
    .sort((first, second) => second.score - first.score)[0];
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
  meaningCount,
  score,
}: {
  lookupTerm: string;
  partOfSpeech: string;
  definition: string;
  synonyms: string[];
  meaningCount: number;
  score: number;
}): HistoryCandidate {
  const displayWord = toDisplayWord(lookupTerm);
  const speechLabel = partOfSpeech || 'word';
  const rootClue = getInferredRootClue(lookupTerm);

  return {
    score,
    origin:
      `"${displayWord}" is listed as a ${speechLabel}${getMeaningHistoryHint(definition)}${getSynonymHistoryHint(synonyms)} WordWiz did not find a fully sourced older etymology in the live lookup, so this history note focuses on current use and visible word parts.`,
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

function getPreferredDefinition(
  meanings: DictionaryMeaning[],
  lookupTerm: string,
) {
  const definitions = meanings.flatMap((meaning) =>
    (meaning.definitions ?? [])
      .filter((definition) => definition.definition?.trim())
      .map((definition) => ({ meaning, definition })),
  );

  return (
    definitions.find(
      ({ definition }) =>
        isUsefulDefinition(definition.definition ?? '', lookupTerm),
    ) ?? definitions[0]
  );
}

function isUsefulDefinition(value: string, lookupTerm: string) {
  const text = value.trim();
  if (!text) {
    return false;
  }

  if (isCircularDefinition(text, lookupTerm)) {
    return false;
  }

  if (/^to\s+[a-z'-]+\.?$/i.test(text)) {
    return false;
  }

  return text.replace(/[^\w\s'-]/g, '').split(/\s+/).filter(Boolean).length >= 3;
}

function isCircularDefinition(value: string, lookupTerm: string) {
  const term = lookupTerm.trim();
  if (!term) {
    return false;
  }

  return new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(value);
}

function getDefinitionFallback(lookupTerm: string): Partial<WordDetails> | null {
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

async function lookupWiktionaryHistory(
  lookupTerm: string,
): Promise<Pick<WordDetails, 'origin' | 'originPeriod'> | null> {
  try {
    const data = await fetchWikimediaJson<WiktionaryExtractResponse>(
      `https://en.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(
        lookupTerm,
      )}`,
    );

    if (!data) return null;

    const page = Object.values(data.query?.pages ?? {}).find(
      (item) => item.extract && !item.missing,
    );
    const etymology = getWiktionaryEtymology(page?.extract ?? '');

    if (!etymology) {
      return null;
    }

    const displayWord = toDisplayWord(lookupTerm);
    const timeClues = getTimeClues(etymology);
    const periodText = timeClues.length
      ? timeClues.join('; ')
      : 'exact dates are not clear in the source text';

    return {
      origin: `"${displayWord}" history from Wiktionary: ${etymology}`,
      originPeriod: `Timeline: ${makeTimelineLead(timeClues)} Source - Wiktionary etymology. Evidence - ${periodText}. Learning note - older word histories often show roots first, then how English usage changed over time.`,
    };
  } catch {
    return null;
  }
}

export function getWiktionaryEtymologyForTest(extract: string) {
  return getWiktionaryEtymology(extract);
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
    /\n(?:Afrikaans|Arabic|Chinese|Dutch|French|German|Greek|Italian|Japanese|Latin|Middle English|Old English|Portuguese|Russian|Spanish|Swedish|Welsh)\n/,
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
