import type { QuizAttempt, QuizQuestion, QuizQuestionDifficulty, QuizQuestionMode, Word } from '../types';
import { FALLBACK_DEFINITIONS } from '../constants/data';

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
): QuizQuestion[] {
  const quizWords = pickQuizWords(words, recentAttempts);

  return quizWords.map((word, index) => {
    const mode = getQuestionModeForMastery(
      masteryByWordId[word.id] ?? word.reviews * 12,
    );

    if (mode === 'definition-to-word') {
      return buildDefinitionToWordQuestion(word, words, index);
    }

    if (mode === 'true-false') {
      return buildTrueFalseQuestion(word, words, index);
    }

    if (mode === 'typed-word') {
      return buildTypedWordQuestion(word);
    }

    return buildWordToDefinitionQuestion(word, words, index);
  });
}

function pickQuizWords(words: Word[], recentAttempts: QuizAttempt[]) {
  const recentWordIds = new Set(
    recentAttempts
      .slice(0, RECENT_ATTEMPTS_TO_AVOID)
      .flatMap((attempt) => attempt.answers.map((answer) => answer.wordId)),
  );
  const lessRecentWords = words.filter((word) => !recentWordIds.has(word.id));
  const priorityWords =
    lessRecentWords.length >= Math.min(words.length, MAX_QUIZ_QUESTIONS)
      ? lessRecentWords
      : words;

  return shuffle(priorityWords).slice(0, MAX_QUIZ_QUESTIONS);
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
  if (mode === 'word-to-definition') return 'multiple-choice';
  if (mode === 'definition-to-word') return 'fill-in-options';
  return 'typed-recall';
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
    prompt: 'CHOOSE THE MEANING',
    displayText: word.term,
    answer,
    options: shuffle([answer, ...distractors]),
    mode: 'word-to-definition',
    difficulty: getQuestionDifficulty('word-to-definition'),
    helperText: 'Choose the closest meaning.',
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
    prompt: 'WHICH WORD FITS?',
    displayText: getMeaning(word),
    answer: word.term,
    options: shuffle([word.term, ...distractors]),
    mode: 'definition-to-word',
    difficulty: getQuestionDifficulty('definition-to-word'),
    helperText: 'Pick the word that matches the meaning.',
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
    prompt: 'TRUE OR FALSE?',
    displayText: `"${word.term}" means ${displayedMeaning.toLowerCase()}`,
    answer: shouldBeTrue ? 'True' : 'False',
    options: ['True', 'False'],
    mode: 'true-false',
    difficulty: getQuestionDifficulty('true-false'),
    helperText: 'Decide if the meaning matches the word.',
    feedback: `"${word.term}" means ${getMeaning(word).toLowerCase()}`,
  };
}

function buildTypedWordQuestion(word: Word): QuizQuestion {
  return {
    word,
    prompt: 'TYPE THE WORD',
    displayText: getMeaning(word),
    answer: word.term,
    options: [],
    mode: 'typed-word',
    difficulty: getQuestionDifficulty('typed-word'),
    helperText: 'Type the word that matches this meaning.',
    feedback: `The word is "${word.term}".`,
  };
}

function getMeaning(word: Word) {
  return word.simpleDefinition || word.definition;
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

function getAlternateWord(word: Word, words: Word[]) {
  return shuffle(words).find((item) => item.id !== word.id);
}

function getTermHash(term: string) {
  return term
    .split('')
    .reduce((total, character) => total + character.charCodeAt(0), 0);
}
