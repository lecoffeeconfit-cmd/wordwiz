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

export async function lookupWordDetails(rawTerm: string): Promise<WordDetails> {
  const lookupTerm = cleanLookupWord(rawTerm);
  if (!lookupTerm) {
    throw new Error('Type a word first.');
  }

  const [dictionaryEntry, wiktionaryHistory, datamuseWords] = await Promise.all([
    lookupDictionaryEntry(lookupTerm),
    lookupWiktionaryHistory(lookupTerm),
    lookupDatamuseWords(lookupTerm),
  ]);

  if (!dictionaryEntry && !datamuseWords.length) {
    throw new Error('No dictionary entry found.');
  }

  const entry = dictionaryEntry;
  const meanings = entry?.meanings ?? [];
  const fallback = getDefinitionFallback(lookupTerm);
  const preferred = getPreferredDefinition(meanings, lookupTerm);
  const firstMeaning = preferred?.meaning ?? meanings[0];
  const firstDefinition = preferred?.definition;
  const datamuseDefinition = getDatamuseDefinition(datamuseWords, lookupTerm);
  const definition =
    fallback?.definition ??
    (firstDefinition?.definition &&
    isUsefulDefinition(firstDefinition.definition, lookupTerm)
      ? firstDefinition.definition
      : datamuseDefinition ?? firstDefinition?.definition ?? '');
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
    lookupTerm,
  });
  const partOfSpeech = firstMeaning?.partOfSpeech ?? getDatamusePartOfSpeech(datamuseWords);
  const historyFallback = getHistoryFallback(lookupTerm);
  const history = chooseBestHistory([
    historyFallback ? { ...historyFallback, score: 100 } : null,
    wiktionaryHistory ? { ...wiktionaryHistory, score: 85 } : null,
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
        : 'This word has one main meaning group in this dictionary.',
      synonyms.length ? `Synonyms include ${synonyms.slice(0, 3).join(', ')}.` : '',
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

function getSynonymCandidates({
  meanings,
  datamuseWords,
  lookupTerm,
}: {
  meanings: DictionaryMeaning[];
  datamuseWords: DatamuseWord[];
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

  return {
    score,
    origin:
      `A detailed older origin for "${displayWord}" was not found in the free sources WordWiz checked. WordWiz can still track how the word is used now: it is a ${speechLabel}${getMeaningHistoryHint(definition)}${getSynonymHistoryHint(synonyms)}`,
    originPeriod: makeTimeline({
      displayWord,
      rootClue: null,
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
    const response = await fetch(
      `https://en.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(
        lookupTerm,
      )}`,
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as WiktionaryExtractResponse;
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
      originPeriod: `Timeline: Wiktionary etymology - ${periodText}. Learning note - older word histories often show roots first, then how English usage changed over time.`,
    };
  } catch {
    return null;
  }
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
    /^Etymology(?:\s+\d+)?$/i.test(line),
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
  const englishMatch = extract.match(/(?:^|\n)English\n([\s\S]*)/);
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
  return /^(Pronunciation|Noun|Verb|Adjective|Adverb|Interjection|Preposition|Conjunction|Determiner|Article|Particle|Numeral|Synonyms|Antonyms|Derived terms|Related terms|Translations|References|Further reading|Anagrams|Etymology\s+\d+)$/i.test(
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
  const sourceLine = hasSourceOrigin
    ? 'Source note - the dictionary included an origin clue for this word.'
    : 'Source note - this dictionary did not include a detailed older origin.';
  const rootLine = rootClue
    ? `Root clue - ${rootClue}`
    : 'Root clue - exact roots are not available from this lookup.';
  const meaningLine =
    meaningCount > 1
      ? `Modern use - "${displayWord}" has ${meaningCount} meaning groups, so it may change meaning by context.`
      : `Modern use - "${displayWord}" is listed as a ${speechLabel} with one main meaning group.`;

  return `Timeline: ${sourceLine} ${rootLine} Learning note - save your own sentence to capture how the word is used today. ${meaningLine}`;
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
