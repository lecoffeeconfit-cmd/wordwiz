import type * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import { COLORS } from '../constants/theme';
import type { ReminderSettings } from '../types';

export type ReminderContext = {
  currentStreak: number;
  hasPracticedToday: boolean;
  dueReviewCount: number;
  quizzesToday: number;
  dailyQuizGoal: number;
  totalQuizQuestions: number;
  overallAccuracy: number | null;
  unreviewedNewWordCount: number;
  pointsToNextLevel: number | null;
  dayKey: string;
};

export type ReminderMessage = {
  title: string;
  body: string;
  kind: 'streak' | 'review' | 'quiz' | 'new-words' | 'mastery' | 'practice';
};

let notificationsModule: typeof ExpoNotifications | null = null;
let notificationsConfigured = false;

async function getNotificationsModule() {
  if (Platform.OS === 'web') {
    throw new Error('Daily reminders are available on iOS and Android.');
  }

  notificationsModule ??= await import('expo-notifications');
  if (!notificationsConfigured) {
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationsConfigured = true;
  }

  return notificationsModule;
}

export async function cancelReminder(settings: ReminderSettings) {
  if (Platform.OS !== 'web') {
    const Notifications = await getNotificationsModule();
    const notificationIds = Array.from(
      new Set([
        ...(settings.notificationIds ?? []),
        ...(settings.notificationId ? [settings.notificationId] : []),
      ]),
    );
    await Promise.all(
      notificationIds.map((id) =>
        Notifications.cancelScheduledNotificationAsync(id),
      ),
    );
  }
}

export async function scheduleDailyReminder(
  settings: ReminderSettings,
  messages: ReminderMessage[] = buildSmartReminderMessages({
    currentStreak: 0,
    hasPracticedToday: false,
    dueReviewCount: 0,
    quizzesToday: 0,
    dailyQuizGoal: 1,
    totalQuizQuestions: 0,
    overallAccuracy: null,
    unreviewedNewWordCount: 0,
    pointsToNextLevel: null,
    dayKey: new Date().toISOString().slice(0, 10),
  }),
): Promise<ReminderSettings> {
  if (Platform.OS === 'web') {
    throw new Error('Daily reminders are available on iOS and Android.');
  }

  const Notifications = await getNotificationsModule();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily-review', {
      name: 'Daily Review',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: COLORS.green,
    });
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  let status = currentPermission.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') {
    throw new Error('Notifications permission was not granted.');
  }

  await cancelReminder(settings);
  const firstReminderDate = getNextReminderDate(settings.hour, settings.minute);
  const notificationIds = await Promise.all(
    Array.from({ length: 7 }, (_, index) => {
      const message = messages[index % messages.length];
      const date = new Date(firstReminderDate);
      date.setDate(date.getDate() + index);

      return Notifications.scheduleNotificationAsync({
        content: {
          title: message.title,
          body: message.body,
          data: { screen: message.kind === 'quiz' ? 'quiz' : 'home' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date,
        },
      });
    }),
  );

  return {
    ...settings,
    enabled: true,
    notificationId: notificationIds[0],
    notificationIds,
  };
}

export function buildSmartReminderMessages(
  context: ReminderContext,
): ReminderMessage[] {
  const messages: ReminderMessage[] = [];

  if (context.currentStreak > 0 && !context.hasPracticedToday) {
    messages.push({
      kind: 'streak',
      title: `${context.currentStreak}-day retrieval streak is active`,
      body: 'A short recall session today preserves your practice interval and adds fresh retention evidence for your saved words.',
    });
  }

  if (context.dueReviewCount > 0) {
    messages.push({
      kind: 'review',
      title: 'Spaced retrieval is due',
      body: `${context.dueReviewCount} ${context.dueReviewCount === 1 ? 'word is' : 'words are'} scheduled for recall. Timely retrieval can strengthen long-term word memory more than rereading.`,
    });
  }

  if (context.quizzesToday < context.dailyQuizGoal) {
    messages.push({
      kind: 'quiz',
      title: context.totalQuizQuestions
        ? `${context.dailyQuizGoal - context.quizzesToday} quiz ${context.dailyQuizGoal - context.quizzesToday === 1 ? 'session' : 'sessions'} left today`
        : 'Build your first recall baseline',
      body: context.overallAccuracy === null
        ? 'A short quiz gives WordWiz its first retrieval data so future review timing can adapt to your memory.'
        : `Your current accuracy is ${context.overallAccuracy}% across ${context.totalQuizQuestions} answers. Another recall session gives WordWiz fresher evidence to adapt review timing.`,
    });
  }

  if (context.unreviewedNewWordCount > 0) {
    messages.push({
      kind: 'new-words',
      title: `${context.unreviewedNewWordCount} new ${context.unreviewedNewWordCount === 1 ? 'word needs' : 'words need'} a first recall`,
      body: 'Early retrieval establishes a memory baseline and helps WordWiz schedule the next review at a useful interval.',
    });
  }

  if (
    context.pointsToNextLevel !== null &&
    context.pointsToNextLevel > 0 &&
    context.pointsToNextLevel <= 5
  ) {
    messages.push({
      kind: 'mastery',
      title: 'Your next mastery level is close',
      body: `You’re ${context.pointsToNextLevel} ${context.pointsToNextLevel === 1 ? 'point' : 'points'} away. Successful recall adds stronger retention evidence than passive review.`,
    });
  }

  messages.push({
    kind: 'practice',
    title: 'Two minutes for deliberate recall',
    body: 'A focused retrieval session can reinforce word memory and gives WordWiz new data to personalize future practice.',
  });

  const rotation = hashDayKey(context.dayKey) % messages.length;
  return [...messages.slice(rotation), ...messages.slice(0, rotation)];
}

function getNextReminderDate(hour: number, minute: number) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function hashDayKey(dayKey: string) {
  return Array.from(dayKey).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  );
}
