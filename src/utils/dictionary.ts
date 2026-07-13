export function cleanLookupWord(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z'-]/g, '');
}

export function fallbackExample(word: string) {
  const displayWord = word.trim() || 'word';
  return `I learned the word ${displayWord} and tried to use it in my own sentence.`;
}

export function makeSimpleDefinition(definition: string, word: string) {
  const displayWord = word.trim() || 'this word';
  const firstSentence = cleanDefinitionText(
    definition.split(/[.;:]/)[0] ?? '',
  );
  if (!firstSentence) {
    return `A plain meaning for ${displayWord}.`;
  }

  const simpleDefinition = simplifyDefinitionText(firstSentence);
  if (!definitionsMatch(simpleDefinition, definition)) {
    return simpleDefinition;
  }

  return `In plain English, ${lowercaseFirst(simpleDefinition)}`;
}

export function makeDistinctSimpleDefinition(
  simpleDefinition: string | undefined,
  definition: string,
  word: string,
) {
  const cleanedSimpleDefinition = cleanDefinitionText(simpleDefinition ?? '');
  if (
    cleanedSimpleDefinition &&
    !isIncompleteDefinitionPrefix(cleanedSimpleDefinition, definition) &&
    !definitionsMatch(cleanedSimpleDefinition, definition)
  ) {
    return cleanedSimpleDefinition;
  }

  return makeSimpleDefinition(definition, word);
}

export function getCompleteFlashcardDefinition(
  definition: string,
  simpleDefinition?: string,
) {
  const cleanedDefinition = cleanDefinitionText(definition);
  const cleanedSimpleDefinition = cleanDefinitionText(simpleDefinition ?? '');

  if (
    !cleanedSimpleDefinition ||
    isIncompleteDefinitionPrefix(cleanedSimpleDefinition, cleanedDefinition)
  ) {
    return cleanedDefinition;
  }

  return cleanedSimpleDefinition;
}

function simplifyDefinitionText(value: string) {
  const simpleText = [
    [/^used to describe\s+/i, ''],
    [/^relating to\s+/i, 'About '],
    [/^of or relating to\s+/i, 'About '],
    [/^connected with\s+/i, 'About '],
    [/^characterized by\s+/i, 'Having '],
    [/^having the quality of\s+/i, 'Having '],
    [/^a person who\s+/i, 'Someone who '],
    [/^one who\s+/i, 'Someone who '],
    [/^the act of\s+/i, 'Doing '],
    [/^the state of being\s+/i, 'Being '],
    [/\bobtain(?:ing)?\b/gi, 'get'],
    [/\butili[sz]e(?:s|d|ing)?\b/gi, 'use'],
    [/\bcommence(?:s|d|ing)?\b/gi, 'start'],
    [/\bterminate(?:s|d|ing)?\b/gi, 'end'],
    [/\bassistance\b/gi, 'help'],
    [/\bapproximately\b/gi, 'about'],
    [/\bnumerous\b/gi, 'many'],
    [/\bdifficult\b/gi, 'hard'],
    [/\badversity\b/gi, 'hard times'],
    [/\bendeavo[u]?r(?:s|ed|ing)?\b/gi, 'try'],
    [/\binquire(?:s|d|ing)?\b/gi, 'ask'],
    [/\bdemonstrate(?:s|d|ing)?\b/gi, 'show'],
    [/\bbrightly\b/gi, 'very bright'],
    [/\brecover quickly(?: from| after)?\b/gi, 'bounce back after'],
    [
      /\beager to know or learn something\b/gi,
      'wanting to learn or ask questions',
    ],
    [/\bgiving off light\b/gi, 'making light'],
  ].reduce(
    (text, [pattern, replacement]) =>
      text.replace(pattern as RegExp, replacement as string),
    value,
  );

  return ensureSentenceEnding(capitalizeFirst(cleanDefinitionText(simpleText)));
}

function cleanDefinitionText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function ensureSentenceEnding(value: string) {
  if (!value || /[.!?]$/.test(value)) {
    return value;
  }

  return `${value}.`;
}

function isIncompleteDefinitionPrefix(simpleDefinition: string, definition: string) {
  const normalizedSimpleDefinition = normalizeDefinitionForComparison(
    simpleDefinition,
  );
  const normalizedDefinition = normalizeDefinitionForComparison(definition);

  return (
    !/[.!?]$/.test(simpleDefinition.trim()) &&
    normalizedDefinition.length > normalizedSimpleDefinition.length &&
    normalizedDefinition.startsWith(normalizedSimpleDefinition)
  );
}

function definitionsMatch(left: string, right: string) {
  return (
    normalizeDefinitionForComparison(left) ===
    normalizeDefinitionForComparison(right)
  );
}

function normalizeDefinitionForComparison(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s'-]/g, '')
    .replace(/\s+/g, ' ');
}

function lowercaseFirst(value: string) {
  return value ? `${value.charAt(0).toLowerCase()}${value.slice(1)}` : value;
}

function capitalizeFirst(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

export function getSynonyms(words: string[]) {
  return Array.from(
    new Set(
      words
        .map((word) => word.trim().toLowerCase())
        .filter((word) => word && word.length <= 14 && !word.includes(' ')),
    ),
  ).slice(0, 6);
}

export function inferOriginPeriod(origin: string) {
  const text = origin.trim();
  if (!text) {
    return 'Time period not available from this dictionary source.';
  }

  const centuryMatch = text.match(
    /\b(?:\d{1,2}(?:st|nd|rd|th)\s+century|1[0-9]{3}s|[2-9][0-9]{2}s)\b/i,
  );
  if (centuryMatch) {
    return `Source mentions ${centuryMatch[0]}.`;
  }

  const periods: { pattern: RegExp; label: string }[] = [
    {
      pattern: /old english/i,
      label: 'Old English period, roughly 450-1150 CE.',
    },
    {
      pattern: /middle english/i,
      label: 'Middle English period, roughly 1150-1500 CE.',
    },
    {
      pattern: /early modern english/i,
      label: 'Early Modern English period, roughly 1500-1700 CE.',
    },
    {
      pattern: /modern english/i,
      label: 'Modern English period, after about 1700 CE.',
    },
    {
      pattern: /latin/i,
      label:
        'Latin roots; exact English entry date is not available from this source.',
    },
    {
      pattern: /greek/i,
      label:
        'Greek roots; exact English entry date is not available from this source.',
    },
    {
      pattern: /old french|anglo-french|french/i,
      label:
        'French roots; many such words entered English after the Norman period.',
    },
  ];

  return (
    periods.find((period) => period.pattern.test(text))?.label ??
    'Time period not available from this dictionary source.'
  );
}

export function formatWordHistoryNarrative(origin?: string, term = 'This word') {
  const fallback =
    'A fully sourced older origin was not found, so this note focuses on current meaning and visible word parts.';
  const cleaned = cleanHistoryTextForDisplay(origin ?? '');

  if (!cleaned) {
    return fallback;
  }

  return cleaned
    .replace(
      /WordWiz did not find a fully sourced older etymology in the live lookup, so this history note focuses on current use and visible word parts\.?/gi,
      fallback,
    )
    .replace(
      /WordWiz did not find a fully sourced older etymology[^.]*\./gi,
      fallback,
    )
    .replace(/^"([^"]+)" history from ([^:]+):\s*/i, '"$1" history: ')
    .replace(/^"([^"]+)" has an open lexical relation in ConceptNet:\s*/i, '"$1" has a related word-history clue: ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^This word\b/i, term.trim() || 'This word');
}

export function formatTimePeriodSnapshot(
  originPeriod?: string,
  origin?: string,
  term = 'This word',
) {
  const sourceText = cleanHistoryTextForDisplay(
    [originPeriod, origin].filter(Boolean).join(' '),
  );
  const firstRecorded = getFirstRecordedSnapshot(sourceText);
  const originLine = getOriginSnapshot(sourceText);
  const enteredEnglish = getEnteredEnglishSnapshot(sourceText);
  const modernMeaning = getModernMeaningSnapshot(sourceText, term);

  return [
    `First recorded: ${firstRecorded ?? 'Exact origin date unknown.'}`,
    `Origin: ${originLine ?? 'Older source language not clear.'}`,
    `Entered English: ${enteredEnglish ?? 'Not clearly dated.'}`,
    `Modern meaning: ${modernMeaning}`,
  ].join('\n');
}

function cleanHistoryTextForDisplay(value: string) {
  return value
    .replace(/\ba\s+aas\b/gi, '')
    .replace(/\b(undefined|null|NaN)\b/gi, '')
    .replace(/Timeline:\s*/gi, '')
    .replace(/Source\s+-\s*[^.]*\./gi, '')
    .replace(/Evidence\s+-\s*[^.]*\./gi, '')
    .replace(/Learning note\s+-\s*older word histories often [^.]*\./gi, '')
    .replace(/Source note\s+-\s*live sources did not return a complete older-origin entry\.?/gi, '')
    .replace(/Source note\s+-\s*the dictionary included an origin clue for this word\.?/gi, '')
    .replace(/Root clue\s+-\s*exact roots are not available from this lookup\.?/gi, '')
    .replace(/Date unknown\s+-\s*no reliable older-origin date was returned\.?/gi, '')
    .replace(/Date unknown\s+-\s*this source has an origin clue but no clear first-use year\.?/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

function getFirstRecordedSnapshot(text: string) {
  const explicit = text.match(
    /\b(?:\d{1,2}(?:st|nd|rd|th)\s+century|1[0-9]{3}s|[2-9][0-9]{2}s|\d{3,4}\s*CE|before\s+\d{3,4}|after\s+\d{3,4}|[12][0-9]{3})\b/i,
  )?.[0];
  if (explicit) return explicit;
  if (/Old English/i.test(text)) return 'Old English period';
  if (/Middle English/i.test(text)) return 'Middle English period';
  if (/Early Modern English/i.test(text)) return 'Early Modern English period';
  return null;
}

function getOriginSnapshot(text: string) {
  const origins = [
    'Old English',
    'Middle English',
    'Old French',
    'Anglo-French',
    'French',
    'Latin',
    'Greek',
    'Germanic',
    'Sanskrit',
    'Persian',
    'Arabic',
  ].filter((origin) => new RegExp(`\\b${origin}\\b`, 'i').test(text));

  if (!origins.length) return null;

  return `${origins.slice(0, 3).join(', ')} roots`;
}

function getEnteredEnglishSnapshot(text: string) {
  const coinedYear = text.match(/\b(?:coined|entered|used)[^.]*?\b([12][0-9]{3})\b[^.]*English/i)?.[1];
  if (coinedYear) {
    return coinedYear;
  }

  const entered = text.match(
    /(?:entered English by|used in English from|became common in English in|English used [^.]*? in|coined [^.]*? in)\s+([^.;]+)/i,
  )?.[1];

  if (entered && !/^English$/i.test(entered.trim())) {
    return entered.trim();
  }

  const explicit = getFirstRecordedSnapshot(text);
  if (explicit && /English|coined|used/i.test(text)) {
    return explicit;
  }

  return null;
}

function getModernMeaningSnapshot(text: string, term: string) {
  const modernUse = text.match(/Modern use\s+-\s*([^.]*)\./i)?.[1];
  if (modernUse) return modernUse.trim();

  const currentUse = text.match(/Today,\s*([^.]*)\./i)?.[1];
  if (currentUse) return currentUse.trim();

  return `${term.trim() || 'This word'} is used with its current meaning today.`;
}
