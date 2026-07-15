import type { QuizAttempt, QuizQuestion, QuizQuestionDifficulty, QuizQuestionMode, Word } from '../types';
import { FALLBACK_DEFINITIONS } from '../constants/data';
import { getCompleteFlashcardDefinition } from './dictionary';

const MAX_QUIZ_QUESTIONS = 10;
const RECENT_ATTEMPTS_TO_AVOID = 3;

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

export function buildQuiz(
  words: Word[],
  recentAttempts: QuizAttempt[] = [],
  masteryByWordId: Record<string, number> = {},
  priorityWordIds: string[] = [],
): QuizQuestion[] {
  const quizWords = pickQuizWords(words, recentAttempts, priorityWordIds);
  const modes = getBalancedQuestionModes(quizWords, masteryByWordId);

  return quizWords.map((word, index) => {
    return buildQuestionForMode(word, quizWords, index, modes[index]);
  });
}

/**
 * Category practice intentionally gives a very small category enough varied
 * retrieval opportunities to feel like a useful round. Normal and due-review
 * quizzes continue to use buildQuiz, with one question per selected word.
 */
export function buildCategoryPracticeQuiz(
  words: Word[],
  recentAttempts: QuizAttempt[] = [],
  masteryByWordId: Record<string, number> = {},
  priorityWordIds: string[] = [],
): QuizQuestion[] {
  if (words.length >= 4) {
    return buildQuiz(words, recentAttempts, masteryByWordId, priorityWordIds);
  }

  const quizWords = pickQuizWords(words, recentAttempts, priorityWordIds);
  const target = getCategoryPracticeQuizTarget(quizWords.length);
  const plan = getCategoryPracticeQuestionPlan(
    quizWords,
    masteryByWordId,
    target,
  );
  const questionKeys = new Set<string>();

  return plan.flatMap(({ word, mode }, index) => {
    const question = buildQuestionForMode(word, quizWords, index, mode);
    const key = `${question.prompt}\u0000${question.displayText}\u0000${question.answer}`;
    if (questionKeys.has(key)) return [];
    questionKeys.add(key);
    return [question];
  });
}

export function getCategoryPracticeQuizTarget(wordCount: number) {
  if (wordCount <= 0) return 0;
  if (wordCount === 1) return 3;
  if (wordCount === 2) return 4;
  if (wordCount === 3) return 6;
  return Math.min(wordCount, MAX_QUIZ_QUESTIONS);
}

function getCategoryPracticeQuestionPlan(
  words: Word[],
  masteryByWordId: Record<string, number>,
  target: number,
) {
  const supportedModes = getSupportedCategoryPracticeModes(words);
  const maxTypedRecall = Math.max(1, Math.round(target * 0.35));
  const usedModesByWordId = new Map<string, Set<QuizQuestionMode>>();
  const modeCounts = new Map<QuizQuestionMode, number>();
  const plan: { word: Word; mode: QuizQuestionMode }[] = [];
  let lastMode: QuizQuestionMode | undefined;

  while (plan.length < target) {
    let addedQuestion = false;

    for (const word of words) {
      if (plan.length >= target) break;

      const usedModes = usedModesByWordId.get(word.id) ?? new Set();
      if (usedModes.size >= Math.min(3, supportedModes.length)) continue;

      const masteryScore = masteryByWordId[word.id] ?? word.reviews * 12;
      const candidates = getCategoryPracticeModeCandidates(
        word,
        masteryScore,
        supportedModes,
        words,
      ).filter(
        (mode) =>
          !usedModes.has(mode) &&
          (mode !== 'typed-word' ||
            (modeCounts.get('typed-word') ?? 0) < maxTypedRecall),
      );
      if (candidates.length === 0) continue;

      const mode = pickLeastUsedMode(candidates, modeCounts, lastMode);
      usedModes.add(mode);
      usedModesByWordId.set(word.id, usedModes);
      modeCounts.set(mode, (modeCounts.get(mode) ?? 0) + 1);
      plan.push({ word, mode });
      lastMode = mode;
      addedQuestion = true;
    }

    if (!addedQuestion) break;
  }

  return plan;
}

function getSupportedCategoryPracticeModes(words: Word[]) {
  // A definition-to-word question needs at least one saved word as a genuine
  // alternative. With one word, use the other three existing formats instead.
  const baseModes = words.length < 2
    ? (['word-to-definition', 'true-false', 'typed-word'] as QuizQuestionMode[])
    : (['word-to-definition', 'definition-to-word', 'true-false', 'typed-word'] as QuizQuestionMode[]);
  const contextualModes: QuizQuestionMode[] = [];

  if (words.some((word) => canBuildSentenceUsageQuestion(word, words))) {
    contextualModes.push('sentence-usage');
  }
  if (words.some((word) => canBuildClosestSynonymQuestion(word, words))) {
    contextualModes.push('closest-synonym');
  }

  return [...baseModes, ...contextualModes];
}

function getCategoryPracticeModeCandidates(
  word: Word,
  masteryScore: number,
  supportedModes: QuizQuestionMode[],
  words: Word[],
) {
  const preferred = getModeCandidates(word, masteryScore, words);
  return [
    ...preferred,
    ...supportedModes.filter(
      (mode) => !preferred.includes(mode) && !isContextualMode(mode),
    ),
  ].filter((mode) => supportedModes.includes(mode));
}

function isContextualMode(mode: QuizQuestionMode) {
  return mode === 'sentence-usage' || mode === 'closest-synonym';
}

function pickLeastUsedMode(
  candidates: QuizQuestionMode[],
  counts: Map<QuizQuestionMode, number>,
  lastMode: QuizQuestionMode | undefined,
) {
  const sorted = [...candidates].sort(
    (first, second) =>
      (counts.get(first) ?? 0) - (counts.get(second) ?? 0) ||
      candidates.indexOf(first) - candidates.indexOf(second),
  );
  return sorted.find((mode) => mode !== lastMode) ?? sorted[0];
}

function buildQuestionForMode(
  word: Word,
  words: Word[],
  index: number,
  mode: QuizQuestionMode,
) {
  if (mode === 'definition-to-word') {
    return buildDefinitionToWordQuestion(word, words, index);
  }

  if (mode === 'true-false') {
    return buildTrueFalseQuestion(word, words, index);
  }

  if (mode === 'typed-word') {
    return buildTypedWordQuestion(word);
  }

  if (mode === 'sentence-usage') {
    return buildSentenceUsageQuestion(word, words, index);
  }

  if (mode === 'closest-synonym') {
    return buildClosestSynonymQuestion(word, words, index);
  }

  return buildWordToDefinitionQuestion(word, words, index);
}

function getBalancedQuestionModes(
  words: Word[],
  masteryByWordId: Record<string, number>,
) {
  const maxTypedRecall = Math.max(1, Math.round(words.length * 0.35));
  const counts = new Map<QuizQuestionMode, number>();
  const modes: QuizQuestionMode[] = [];

  words.forEach((word) => {
    const masteryScore = masteryByWordId[word.id] ?? word.reviews * 12;
    const candidates = getModeCandidates(word, masteryScore, words);
    const lastMode = modes.at(-1);
    const mode =
      candidates.find(
        (candidate) =>
          (candidate !== 'typed-word' ||
            (counts.get('typed-word') ?? 0) < maxTypedRecall) &&
          candidate !== lastMode,
      ) ??
      candidates.find(
        (candidate) =>
          candidate !== 'typed-word' ||
          (counts.get('typed-word') ?? 0) < maxTypedRecall,
      ) ??
      candidates[0];

    modes.push(mode);
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  });

  return modes;
}

function getModeCandidates(
  word: Word,
  masteryScore: number,
  words: Word[] = [],
): QuizQuestionMode[] {
  const canUseSentence = canBuildSentenceUsageQuestion(word, words);
  const canUseSynonym = canBuildClosestSynonymQuestion(word, words);
  const contextualModes: QuizQuestionMode[] = [
    ...(canUseSentence ? ['sentence-usage' as const] : []),
    ...(canUseSynonym ? ['closest-synonym' as const] : []),
  ];

  if (word.mastery?.lastReviewResult === 'wrong') {
    return ['word-to-definition', 'true-false', 'definition-to-word', ...contextualModes];
  }
  if (masteryScore >= 85) {
    return ['typed-word', ...contextualModes, 'definition-to-word', 'true-false'];
  }
  if (masteryScore >= 70) {
    return [...contextualModes, 'definition-to-word', 'typed-word', 'true-false'];
  }
  if (masteryScore >= 25) {
    return [
      ...(canUseSentence ? ['sentence-usage' as const] : []),
      'true-false',
      'word-to-definition',
      'definition-to-word',
      ...(canUseSynonym ? ['closest-synonym' as const] : []),
    ];
  }
  return ['word-to-definition', 'true-false', 'definition-to-word'];
}

function pickQuizWords(
  words: Word[],
  recentAttempts: QuizAttempt[],
  priorityWordIds: string[],
) {
  const wordsById = new Map(words.map((word) => [word.id, word]));
  const scheduledPriorityWords = Array.from(new Set(priorityWordIds))
    .map((wordId) => wordsById.get(wordId))
    .filter((word): word is Word => Boolean(word));
  const priorityWordIdsSet = new Set(
    scheduledPriorityWords.map((word) => word.id),
  );
  const remainingWords = words.filter((word) => !priorityWordIdsSet.has(word.id));
  const recentWordIds = new Set(
    recentAttempts
      .slice(0, RECENT_ATTEMPTS_TO_AVOID)
      .flatMap((attempt) => attempt.answers.map((answer) => answer.wordId)),
  );
  const lessRecentWords = remainingWords.filter(
    (word) => !recentWordIds.has(word.id),
  );
  const fillWords =
    lessRecentWords.length >=
    Math.min(
      remainingWords.length,
      MAX_QUIZ_QUESTIONS - scheduledPriorityWords.length,
    )
      ? lessRecentWords
      : remainingWords;

  return [
    ...scheduledPriorityWords,
    ...shuffle(fillWords).filter(
      (word) => !priorityWordIdsSet.has(word.id),
    ),
  ].slice(0, MAX_QUIZ_QUESTIONS);
}

/**
 * Move from recognition to recall as a word becomes more familiar. New words
 * show the word first, building words check comprehension, and strong words
 * ask the learner to recall the word from its meaning.
 */
export function getQuestionModeForMastery(
  masteryScore: number,
): QuizQuestionMode {
  if (masteryScore >= 85) return 'typed-word';
  if (masteryScore >= 70) return 'definition-to-word';
  if (masteryScore >= 25) return 'true-false';
  return 'word-to-definition';
}

export function getQuestionDifficulty(
  mode: QuizQuestionMode,
): QuizQuestionDifficulty {
  if (mode === 'true-false') return 'recognition';
  if (
    mode === 'word-to-definition' ||
    mode === 'sentence-usage' ||
    mode === 'closest-synonym'
  ) {
    return 'multiple-choice';
  }
  if (mode === 'definition-to-word') return 'fill-in-options';
  return 'typed-recall';
}

export function evaluateQuizAnswer(
  answer: string,
  response: string | null,
  mode: QuizQuestionMode,
) {
  if (response === null) {
    return { correct: false, hasSpellingNote: false };
  }
  if (mode !== 'typed-word') {
    return { correct: response === answer, hasSpellingNote: false };
  }

  const normalizedAnswer = normalizeTypedAnswer(answer);
  const normalizedResponse = normalizeTypedAnswer(response);
  if (normalizedResponse === normalizedAnswer) {
    return { correct: true, hasSpellingNote: false };
  }

  const hasSpellingNote = isCloseTypedAnswer(
    normalizedAnswer,
    normalizedResponse,
  );
  return { correct: hasSpellingNote, hasSpellingNote };
}

export function getTypedRecallHint(word: Word, hintStep: number) {
  const answer = word.term.trim();
  if (!answer || hintStep < 1) return null;

  if (hintStep === 1) {
    return `It starts with “${answer.charAt(0)}”.`;
  }
  if (hintStep === 2) {
    return `${answer.replace(/[^\p{L}\p{N}]/gu, '').length} letters · ${getHintPattern(answer)}`;
  }

  if (word.partOfSpeech) {
    return `Part of speech: ${word.partOfSpeech}.`;
  }

  const hiddenExample = hideWordInExample(word.example, answer);
  if (hiddenExample) {
    return `Example: ${hiddenExample}`;
  }

  if (word.basicInfo) {
    return word.basicInfo;
  }

  return 'Think about the complete meaning above.';
}

function buildWordToDefinitionQuestion(
  word: Word,
  words: Word[],
  index: number,
): QuizQuestion {
  const answer = getMeaning(word);
  const distractors = getDefinitionDistractors(word, words, index);

  return {
    word,
    prompt: 'WHAT DOES THIS WORD MEAN?',
    displayText: word.term,
    answer,
    options: shuffle([answer, ...distractors]),
    mode: 'word-to-definition',
    difficulty: getQuestionDifficulty('word-to-definition'),
    helperText: 'Choose the meaning that matches this word.',
    feedback: `"${word.term}" means ${answer.toLowerCase()}`,
  };
}

function buildDefinitionToWordQuestion(
  word: Word,
  words: Word[],
  index: number,
): QuizQuestion {
  const distractors = getWordDistractors(word, words, index);

  return {
    word,
    prompt: 'WHAT WORD MEANS THIS?',
    displayText: getMeaning(word),
    answer: word.term,
    options: shuffle([word.term, ...distractors]),
    mode: 'definition-to-word',
    difficulty: getQuestionDifficulty('definition-to-word'),
    helperText: 'Choose the word that matches this meaning.',
    feedback: `The word is "${word.term}".`,
  };
}

function buildTrueFalseQuestion(
  word: Word,
  words: Word[],
  index: number,
): QuizQuestion {
  const shouldBeTrue = words.length < 2 || getTermHash(word.term) % 2 === 0;
  const pairedWord = shouldBeTrue ? word : getAlternateWord(word, words) ?? word;
  const displayedMeaning = getMeaning(pairedWord);

  return {
    word,
    prompt: 'IS THIS MATCH CORRECT?',
    displayText: `"${word.term}" means ${displayedMeaning.toLowerCase()}`,
    answer: shouldBeTrue ? 'True' : 'False',
    options: ['True', 'False'],
    mode: 'true-false',
    difficulty: getQuestionDifficulty('true-false'),
    helperText: 'Choose True if the word and meaning match.',
    feedback: `"${word.term}" means ${getMeaning(word).toLowerCase()}`,
  };
}

function buildTypedWordQuestion(word: Word): QuizQuestion {
  return {
    word,
    prompt: 'WHAT WORD MEANS THIS?',
    displayText: getMeaning(word),
    answer: word.term,
    options: [],
    mode: 'typed-word',
    difficulty: getQuestionDifficulty('typed-word'),
    helperText: 'Type the word that matches this meaning, then check your answer.',
    feedback: `The word is "${word.term}".`,
  };
}

function buildSentenceUsageQuestion(
  word: Word,
  words: Word[],
  index: number,
): QuizQuestion {
  const answer = getCorrectExample(word);
  const distractors = getSentenceDistractors(word, words, answer, index);

  return {
    word,
    prompt: 'CHOOSE THE SENTENCE',
    displayText: `Which sentence uses “${word.term}” correctly?`,
    answer,
    options: shuffle([answer, ...distractors]),
    mode: 'sentence-usage',
    difficulty: getQuestionDifficulty('sentence-usage'),
    helperText: 'Look for the context that best matches the word’s meaning.',
    feedback: `“${word.term}” means ${getMeaning(word).toLowerCase()}`,
  };
}

function buildClosestSynonymQuestion(
  word: Word,
  words: Word[],
  index: number,
): QuizQuestion {
  const answer = getSynonymCandidates(word)[0];
  const distractors = getSynonymDistractors(word, words, answer, index);

  return {
    word,
    prompt: 'CHOOSE THE CLOSEST SYNONYM',
    displayText: `Which word is closest in meaning to “${word.term}”?`,
    answer,
    options: shuffle([answer, ...distractors]),
    mode: 'closest-synonym',
    difficulty: getQuestionDifficulty('closest-synonym'),
    helperText: 'Choose the word with the most similar meaning.',
    feedback: `“${answer}” is a close synonym of “${word.term}”.`,
  };
}

function getMeaning(word: Word) {
  return getCompleteFlashcardDefinition(word.definition, word.simpleDefinition);
}

function getDefinitionDistractors(word: Word, words: Word[], index: number) {
  const answer = getMeaning(word);
  const otherDefinitions = words
    .filter((item) => item.id !== word.id)
    .map(getMeaning);
  const fallbacks = FALLBACK_DEFINITIONS.filter(
    (definition) => definition !== answer,
  );

  return shuffle(
    Array.from(
      new Set([
        ...otherDefinitions,
        ...fallbacks.slice(index),
        ...fallbacks.slice(0, index),
      ]),
    ),
  ).slice(0, 3);
}

function getWordDistractors(word: Word, words: Word[], index: number) {
  const otherTerms = words
    .filter((item) => item.id !== word.id)
    .map((item) => item.term);
  const fallbackTerms = shuffle(words.map((item) => item.term))
    .filter((term) => term !== word.term)
    .slice(index);

  return shuffle(Array.from(new Set([...otherTerms, ...fallbackTerms]))).slice(0, 3);
}

function canBuildSentenceUsageQuestion(word: Word, words: Word[]) {
  const answer = getCorrectExample(word);
  return Boolean(answer) && getSentenceDistractors(word, words, answer, 0).length >= 2;
}

function getCorrectExample(word: Word) {
  const examples = [word.example, ...(word.wordnik_examples ?? [])];
  return examples.find((example) => includesWholeTerm(example, word.term))?.trim() ?? '';
}

function getSentenceDistractors(
  word: Word,
  words: Word[],
  answer: string,
  index: number,
) {
  const samePartOfSpeech = words.filter(
    (item) =>
      item.id !== word.id &&
      Boolean(word.partOfSpeech) &&
      item.partOfSpeech === word.partOfSpeech,
  );
  const otherWords = words.filter((item) => item.id !== word.id);
  const candidates = [...samePartOfSpeech, ...otherWords].flatMap((item) => {
    const source = getCorrectExample(item);
    const replacement = replaceWholeTerm(source, item.term, word.term);
    return replacement && replacement !== answer ? [replacement] : [];
  });

  return rotateAndPickUnique(candidates, answer, index, 3);
}

function canBuildClosestSynonymQuestion(word: Word, words: Word[]) {
  const answer = getSynonymCandidates(word)[0];
  return Boolean(answer) && getSynonymDistractors(word, words, answer, 0).length >= 2;
}

function getSynonymCandidates(word: Word) {
  return Array.from(
    new Set([...(word.synonyms ?? []), ...(word.commonWords ?? [])])
      .values(),
  )
    .map((synonym) => synonym.trim())
    .filter(
      (synonym) =>
        synonym.length > 1 && synonym.toLocaleLowerCase() !== word.term.toLocaleLowerCase(),
    );
}

function getSynonymDistractors(
  word: Word,
  words: Word[],
  answer: string,
  index: number,
) {
  const candidates = words
    .filter((item) => item.id !== word.id)
    .flatMap((item) => [...getSynonymCandidates(item), item.term]);

  return rotateAndPickUnique(candidates, answer, index, 3);
}

function rotateAndPickUnique(
  candidates: string[],
  answer: string,
  index: number,
  count: number,
) {
  const normalizedAnswer = answer.toLocaleLowerCase();
  const unique = Array.from(
    new Map(
      candidates
        .map((candidate) => candidate.trim())
        .filter(
          (candidate) =>
            candidate.length > 1 && candidate.toLocaleLowerCase() !== normalizedAnswer,
        )
        .map((candidate) => [candidate.toLocaleLowerCase(), candidate]),
    ).values(),
  );
  const start = unique.length === 0 ? 0 : index % unique.length;
  return [...unique.slice(start), ...unique.slice(0, start)].slice(0, count);
}

function includesWholeTerm(value: string, term: string) {
  if (!value.trim() || !term.trim()) return false;
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escapedTerm}\\b`, 'i').test(value);
}

function replaceWholeTerm(value: string, sourceTerm: string, replacement: string) {
  if (!value.trim() || !sourceTerm.trim()) return null;
  const escapedTerm = sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`\\b${escapedTerm}\\b`, 'gi');
  if (!expression.test(value)) return null;
  return value.replace(expression, replacement).trim();
}

function getAlternateWord(word: Word, words: Word[]) {
  return shuffle(words).find((item) => item.id !== word.id);
}

function getTermHash(term: string) {
  return term
    .split('')
    .reduce((total, character) => total + character.charCodeAt(0), 0);
}

function getHintPattern(answer: string) {
  const revealIndexes = new Set([
    0,
    Math.floor(answer.length / 2),
    Math.max(0, answer.length - 1),
  ]);

  return Array.from(answer)
    .map((character, index) => {
      if (!/[\p{L}\p{N}]/u.test(character)) return character;
      return revealIndexes.has(index) ? character : '_';
    })
    .join(' ');
}

function hideWordInExample(example: string, term: string) {
  if (!example.trim()) return null;
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hidden = example.replace(new RegExp(`\\b${escapedTerm}\\b`, 'gi'), '_____');
  return hidden === example ? null : hidden;
}

function normalizeTypedAnswer(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

function isCloseTypedAnswer(answer: string, response: string) {
  if (!answer || !response) return false;
  const allowedTypos = Math.min(
    3,
    Math.max(1, Math.floor(answer.length * 0.18)),
  );
  if (response.length < answer.length - allowedTypos) return false;

  return getEditDistance(answer, response) <= allowedTypos;
}

function getEditDistance(first: string, second: string) {
  const previous = Array.from(
    { length: second.length + 1 },
    (_, index) => index,
  );

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let diagonal = previous[0];
    previous[0] = firstIndex;

    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const above = previous[secondIndex];
      previous[secondIndex] = Math.min(
        previous[secondIndex] + 1,
        previous[secondIndex - 1] + 1,
        diagonal +
          (first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }

  return previous[second.length];
}
