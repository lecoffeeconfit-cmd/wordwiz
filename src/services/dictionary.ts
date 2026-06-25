import type { DictionaryEntry, WordDetails } from '../types';
import { cleanLookupWord, fallbackExample, getCommonWords, inferOriginPeriod, makeSimpleDefinition } from '../utils';

type WordSuggestion = {
  word?: string;
  score?: number;
};

export async function lookupWordDetails(rawTerm: string): Promise<WordDetails> {
  const lookupTerm = cleanLookupWord(rawTerm);
  if (!lookupTerm) {
    throw new Error('Type a word first.');
  }

  const response = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
      lookupTerm,
    )}`,
  );

  if (!response.ok) {
    throw new Error('No dictionary entry found.');
  }

  const entries = (await response.json()) as DictionaryEntry[];
  const entry = entries[0];
  const meanings = entry?.meanings ?? [];
  const firstMeaning = meanings[0];
  const firstDefinition = firstMeaning?.definitions?.find(
    (item) => item.definition,
  );
  const exampleDefinition =
    firstMeaning?.definitions?.find((item) => item.example) ?? firstDefinition;
  const pronunciation =
    entry?.phonetic ??
    entry?.phonetics?.find((phonetic) => phonetic.text)?.text ??
    '';
  const synonyms = Array.from(
    new Set(
      meanings.flatMap((meaning) => [
        ...(meaning.synonyms ?? []),
        ...(meaning.definitions ?? []).flatMap(
          (definition) => definition.synonyms ?? [],
        ),
      ]),
    ),
  ).slice(0, 5);
  const partOfSpeech = firstMeaning?.partOfSpeech ?? '';
  const origin =
    entry?.origin ??
    'This dictionary source did not include an older word history for this entry.';

  return {
    definition: firstDefinition?.definition ?? '',
    simpleDefinition: makeSimpleDefinition(
      firstDefinition?.definition ?? '',
      rawTerm,
    ),
    example: exampleDefinition?.example ?? fallbackExample(rawTerm),
    partOfSpeech,
    pronunciation,
    origin,
    originPeriod: inferOriginPeriod(origin),
    synonyms,
    commonWords: getCommonWords(synonyms),
    basicInfo: [
      partOfSpeech ? `Usually used as a ${partOfSpeech}.` : '',
      meanings.length > 1
        ? `This word has ${meanings.length} common meaning groups.`
        : 'This word has one main meaning group in this dictionary.',
      synonyms.length ? `Similar words include ${synonyms.slice(0, 3).join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  };
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
