import type { QuizQuestion, Word } from '../types';
import { FALLBACK_DEFINITIONS } from '../constants/data';

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

export function buildQuiz(words: Word[]): QuizQuestion[] {
  return shuffle(words)
    .slice(0, 5)
    .map((word, index) => {
      const answer = word.simpleDefinition || word.definition;
      const otherDefinitions = words
        .filter((item) => item.id !== word.id)
        .map((item) => item.simpleDefinition || item.definition);
      const fallbacks = FALLBACK_DEFINITIONS.filter(
        (definition) => definition !== answer,
      );
      const distractors = shuffle(
        Array.from(
          new Set([
            ...otherDefinitions,
            ...fallbacks.slice(index),
            ...fallbacks.slice(0, index),
          ]),
        ),
      ).slice(0, 3);

      return {
        word,
        answer,
        options: shuffle([answer, ...distractors]),
      };
    });
}
