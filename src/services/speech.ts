import * as Speech from 'expo-speech';
import { reportError } from './errorReporting';

export function speakWord(term: string) {
  const word = term.trim();
  if (!word) {
    return;
  }

  try {
    Speech.stop();
    Speech.speak(word, {
      language: 'en-US',
      pitch: 1,
      rate: 0.84,
    });
  } catch (error) {
    reportError(error, {
      feature: 'speech',
      word: word.slice(0, 40),
    });
  }
}
