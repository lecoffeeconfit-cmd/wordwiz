export function cleanLookupWord(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z'-]/g, '');
}

export function fallbackExample(word: string) {
  const displayWord = word.trim() || 'word';
  return `I learned the word ${displayWord} and tried to use it in my own sentence.`;
}

export function makeSimpleDefinition(definition: string, word: string) {
  const firstSentence = definition.split(/[.;:]/)[0]?.trim();
  if (!firstSentence) {
    return `A simple meaning for ${word.trim() || 'this word'}.`;
  }

  return firstSentence
    .replace(/^used to describe\s+/i, '')
    .replace(/^relating to\s+/i, 'About ')
    .replace(/\s+/g, ' ')
    .slice(0, 95);
}

export function getCommonWords(words: string[]) {
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
