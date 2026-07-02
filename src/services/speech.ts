import * as Speech from 'expo-speech';
import { reportError } from './errorReporting';

export async function speakWord(term: string) {
  const word = term.trim();
  if (!word) {
    return;
  }

  try {
    await Speech.stop();
    Speech.speak(word, {
      language: 'en-US',
      pitch: 1,
      rate: 0.84,
      volume: 1,
      useApplicationAudioSession: false,
      onError: (error) => {
        reportError(error, {
          feature: 'speech',
          word: word.slice(0, 40),
        });
      },
    });
  } catch (error) {
    reportError(error, {
      feature: 'speech',
      word: word.slice(0, 40),
    });
  }
}
