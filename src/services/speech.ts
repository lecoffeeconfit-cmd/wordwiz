import * as Speech from 'expo-speech';
import { reportError } from './errorReporting';

export async function speakWord(term: string) {
  return speakText(term, 'word');
}

export async function speakDefinition(definition: string) {
  return speakText(definition, 'definition');
}

async function speakText(text: string, kind: 'word' | 'definition') {
  const content = text.trim();
  if (!content) {
    return;
  }

  try {
    await Speech.stop();
    Speech.speak(content, {
      language: 'en-US',
      pitch: 1,
      rate: 0.84,
      volume: 1,
      useApplicationAudioSession: false,
      onError: (error) => {
        reportError(error, {
          feature: 'speech',
          [kind]: content.slice(0, 80),
        });
      },
    });
  } catch (error) {
    reportError(error, {
      feature: 'speech',
      [kind]: content.slice(0, 80),
    });
  }
}
