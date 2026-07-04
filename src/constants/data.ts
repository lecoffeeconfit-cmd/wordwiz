import type { AnalyticsData, ReminderSettings, Word } from '../types';

export const WORDS_KEY = '@wordwiz/words';
export const QUIZ_KEY = '@wordwiz/quiz-progress';
export const ANALYTICS_KEY = '@wordwiz/analytics';
export const REMINDER_KEY = '@wordwiz/reminder-settings';
export const AUTH_USERS_KEY = '@wordwiz/auth-users';
export const AUTH_SESSION_KEY = '@wordwiz/auth-session';
export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: false,
  hour: 19,
  minute: 0,
};
export const EMPTY_ANALYTICS: AnalyticsData = {
  quizHistory: [],
  cardHistory: [],
};

export const STARTER_WORDS: Word[] = [
  {
    id: 'starter-1',
    term: 'Curious',
    definition: 'Eager to know or learn something.',
    simpleDefinition: 'Wanting to learn or ask questions.',
    example: 'Maya was curious about how the tiny seed became a flower.',
    partOfSpeech: 'adjective',
    pronunciation: '/ˈkjʊriəs/',
    origin: 'From Latin curiosus, meaning careful or inquisitive.',
    originPeriod: 'Latin roots; entered English by the late Middle English period.',
    synonyms: ['interested', 'eager', 'inquiring'],
    antonyms: ['bored', 'indifferent'],
    commonWords: ['interested', 'eager', 'questioning'],
    basicInfo: 'Often describes someone who likes asking questions and exploring.',
    createdAt: new Date(Date.now() - 86_400_000 * 2).toISOString(),
    reviews: 1,
  },
  {
    id: 'starter-2',
    term: 'Radiant',
    definition: 'Shining brightly or showing great happiness.',
    simpleDefinition: 'Very bright or very happy.',
    example: 'His radiant smile made everyone in the room feel welcome.',
    partOfSpeech: 'adjective',
    pronunciation: '/ˈreɪdiənt/',
    origin: 'From Latin radiare, meaning to shine.',
    originPeriod: 'Latin roots; used in English from around the early modern period.',
    synonyms: ['bright', 'glowing', 'beaming'],
    antonyms: ['dim', 'dull'],
    commonWords: ['bright', 'shiny', 'happy'],
    basicInfo: 'Can describe light, heat, beauty, or a very happy expression.',
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    reviews: 0,
  },
  {
    id: 'starter-3',
    term: 'Resilient',
    definition: 'Able to recover quickly after something difficult.',
    simpleDefinition: 'Able to bounce back after something hard.',
    example: 'The resilient little tree grew again after the storm.',
    partOfSpeech: 'adjective',
    pronunciation: '/rɪˈzɪliənt/',
    origin: 'From Latin resilire, meaning to spring back.',
    originPeriod: 'Latin roots; became common in English in the 1600s.',
    synonyms: ['tough', 'flexible', 'strong'],
    antonyms: ['fragile', 'weak'],
    commonWords: ['strong', 'tough', 'brave'],
    basicInfo: 'Often used for people, communities, materials, and systems.',
    createdAt: new Date().toISOString(),
    reviews: 2,
  },
];

export const FALLBACK_DEFINITIONS = [
  'A feeling of calm confidence.',
  'To move carefully and quietly.',
  'Something that happens very rarely.',
  'Full of energy and excitement.',
  'To make something easier to understand.',
  'A surprising and useful discovery.',
];
