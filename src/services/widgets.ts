import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { AnalyticsData, Word } from '../types';
import { buildWordWizWidgetSnapshot } from '../widgets/config';
import {
  DEFAULT_WORDWIZ_WIDGET_CONFIG,
  type WordWizWidgetConfig,
} from '../widgets/types';
import { WordWizWidget } from '../widgets/WordWizWidget';

const WIDGET_CONFIG_KEY = 'widget-config';

function getWidgetConfigKey(userId: string) {
  return `@wordwiz/users/${userId}/${WIDGET_CONFIG_KEY}`;
}

function isValidConfig(value: unknown): value is Partial<WordWizWidgetConfig> {
  return Boolean(value && typeof value === 'object');
}

export async function loadWordWizWidgetConfig(userId: string) {
  try {
    const stored = await AsyncStorage.getItem(getWidgetConfigKey(userId));
    if (!stored) return DEFAULT_WORDWIZ_WIDGET_CONFIG;
    const parsed: unknown = JSON.parse(stored);
    if (!isValidConfig(parsed)) return DEFAULT_WORDWIZ_WIDGET_CONFIG;

    return {
      ...DEFAULT_WORDWIZ_WIDGET_CONFIG,
      ...parsed,
    } as WordWizWidgetConfig;
  } catch {
    return DEFAULT_WORDWIZ_WIDGET_CONFIG;
  }
}

export async function saveWordWizWidgetConfig(
  userId: string,
  config: WordWizWidgetConfig,
  words: Word[],
  analytics: AnalyticsData,
  dailyLearningGoal: number,
) {
  await AsyncStorage.setItem(getWidgetConfigKey(userId), JSON.stringify(config));
  await publishWordWizWidget(config, words, analytics, dailyLearningGoal);
}

export async function syncSavedWordWizWidget(
  userId: string,
  words: Word[],
  analytics: AnalyticsData,
  dailyLearningGoal: number,
) {
  if (Platform.OS !== 'ios') return;
  const config = await loadWordWizWidgetConfig(userId);
  await publishWordWizWidget(config, words, analytics, dailyLearningGoal);
}

async function publishWordWizWidget(
  config: WordWizWidgetConfig,
  words: Word[],
  analytics: AnalyticsData,
  dailyLearningGoal: number,
) {
  if (Platform.OS !== 'ios') return;
  const now = new Date();
  const isDailyTimeline = config.refresh === 'daily' || config.widgetType === 'word-of-the-day' || config.widgetType === 'daily-challenge';
  const entries = isDailyTimeline
    ? [
        { date: now, props: buildWordWizWidgetSnapshot(config, words, analytics, dailyLearningGoal, now) },
        ...Array.from({ length: 8 }, (_, index) => {
          const date = new Date(now);
          date.setHours(24, 0, 0, 0);
          date.setDate(date.getDate() + index);
          return {
            date,
            props: buildWordWizWidgetSnapshot(config, words, analytics, dailyLearningGoal, date),
          };
        }),
      ]
    : config.refresh === 'throughout-day'
      ? [0, 6, 12, 18].map((hours, index) => {
          const date = new Date(now.getTime() + hours * 60 * 60 * 1000);
          return {
            date,
            props: buildWordWizWidgetSnapshot(
              config,
              words,
              analytics,
              dailyLearningGoal,
              date,
              index,
            ),
          };
        })
      : [{
          date: now,
          props: buildWordWizWidgetSnapshot(config, words, analytics, dailyLearningGoal, now),
        }];
  WordWizWidget.updateTimeline(entries);
  WordWizWidget.reload();
}
