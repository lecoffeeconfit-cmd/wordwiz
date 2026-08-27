export type WordWizWidgetType =
  | 'review-word'
  | 'word-of-the-day'
  | 'daily-challenge'
  | 'streak'
  | 'words-due';
export type WordWizWidgetSize = 'small' | 'medium' | 'large';
export type WordWizWidgetSource = 'saved' | 'flagged' | 'weak' | 'random';
export type WordWizWidgetRefresh = 'daily' | 'throughout-day';
export type WordWizWidgetStyle = 'midnight' | 'notebook' | 'meadow';

export type WordWizWidgetConfig = {
  widgetType: WordWizWidgetType;
  size: WordWizWidgetSize;
  style: WordWizWidgetStyle;
  source: WordWizWidgetSource;
  refresh: WordWizWidgetRefresh;
  quickAddEnabled: boolean;
};

export type WordWizWidgetWord = {
  id: string;
  term: string;
  definition: string;
  plainDefinition: string;
  example: string;
  partOfSpeech: string;
  pronunciation: string;
  synonyms: string[];
  antonyms: string[];
};

export type WordWizWidgetSnapshot = {
  widgetType: WordWizWidgetType;
  size: WordWizWidgetSize;
  style: WordWizWidgetStyle;
  currentWord: WordWizWidgetWord;
  rotationWords: WordWizWidgetWord[];
  rotationIndex: number;
  streakCurrent: number;
  activitiesToday: number;
  dailyGoal: number;
  dueCount: number;
  retentionPercent: number;
  retentionHasEvidence: boolean;
  quickAddEnabled: boolean;
  updatedAt: string;
};

export const DEFAULT_WORDWIZ_WIDGET_CONFIG: WordWizWidgetConfig = {
  widgetType: 'review-word',
  size: 'medium',
  style: 'midnight',
  source: 'saved',
  refresh: 'daily',
  quickAddEnabled: true,
};
