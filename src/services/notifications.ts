import type * as ExpoNotifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { COLORS } from '../constants/theme';
import type { ReminderSettings } from '../types';

export type ReminderContext = {
  currentStreak: number;
  longestStreak: number;
  hasPracticedToday: boolean;
  dueReviewCount: number;
  quizzesToday: number;
  dailyQuizGoal: number;
  totalQuizSessions: number;
  totalQuizQuestions: number;
  overallAccuracy: number | null;
  unreviewedNewWordCount: number;
  pointsToNextLevel: number | null;
  nextMasteryLevelTitle: string | null;
  masteredWordCount: number;
  totalWordCount: number;
  omegaTestAvailable: boolean;
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

/**
 * Requests notification permission only after a learner explicitly enables
 * Community nudges. The returned token is stored through a protected RPC.
 */
export async function getCommunityExpoPushToken() {
  if (Platform.OS === 'web') {
    throw new Error('Push notifications are available on iOS and Android.');
  }
  const Notifications = await getNotificationsModule();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('study-nudges', {
      name: 'Study nudges',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
      lightColor: COLORS.purple,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') {
    throw new Error('Notifications permission was not granted.');
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Push notifications are not configured for this build.');
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}

/** Opens the Community destination for a remote study nudge. */
export async function subscribeToCommunityNudgeResponses(onOpenCommunity: () => void) {
  if (Platform.OS === 'web') return () => undefined;
  const Notifications = await getNotificationsModule();
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.destination === 'community') onOpenCommunity();
  });
  return () => subscription.remove();
}

export async function scheduleDailyReminder(
  settings: ReminderSettings,
  messages: ReminderMessage[] = buildSmartReminderMessages({
    currentStreak: 0,
    longestStreak: 0,
    hasPracticedToday: false,
    dueReviewCount: 0,
    quizzesToday: 0,
    dailyQuizGoal: 1,
    totalQuizSessions: 0,
    totalQuizQuestions: 0,
    overallAccuracy: null,
    unreviewedNewWordCount: 0,
    pointsToNextLevel: null,
    nextMasteryLevelTitle: null,
    masteredWordCount: 0,
    totalWordCount: 0,
    omegaTestAvailable: false,
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
    const daysToBeatBest = Math.max(
      1,
      context.longestStreak - context.currentStreak + 1,
    );
    const streakBody =
      context.longestStreak > context.currentStreak
        ? `Study for ${daysToBeatBest} more days to beat your ${context.longestStreak}-day best.`
        : `Study today to extend your streak to ${context.currentStreak + 1} days.`;

    messages.push({
      kind: 'streak',
      title: `Keep your ${context.currentStreak}-day streak`,
      body: streakBody,
    });
  }

  if (context.dueReviewCount > 0) {
    const estimatedMinutes = Math.max(
      2,
      Math.ceil(context.dueReviewCount * 0.75),
    );

    messages.push({
      kind: 'review',
      title: `${context.dueReviewCount} ${context.dueReviewCount === 1 ? 'word' : 'words'} due`,
      body: `Review them in about ${estimatedMinutes} min to strengthen recall.`,
    });
  }

  if (context.quizzesToday < context.dailyQuizGoal) {
    const quizzesLeft = context.dailyQuizGoal - context.quizzesToday;

    messages.push({
      kind: 'quiz',
      title: `${quizzesLeft} quiz${quizzesLeft === 1 ? '' : 'zes'} left today`,
      body: `Finish ${quizzesLeft} to hit your ${context.dailyQuizGoal}-quiz daily goal.`,
    });
  }

  if (context.unreviewedNewWordCount > 0) {
    messages.push({
      kind: 'new-words',
      title: `${context.unreviewedNewWordCount} new ${context.unreviewedNewWordCount === 1 ? 'word' : 'words'} to unlock`,
      body: `Quiz them once to start their spaced-review plan.`,
    });
  }

  if (context.totalWordCount > 0 && context.masteredWordCount < context.totalWordCount) {
    const wordsLeftToMaster = context.totalWordCount - context.masteredWordCount;

    messages.push({
      kind: 'mastery',
      title: `${context.masteredWordCount}/${context.totalWordCount} words mastered`,
      body: `Keep using spaced quizzes to master ${wordsLeftToMaster} more.`,
    });
  }

  if (
    context.pointsToNextLevel !== null &&
    context.pointsToNextLevel > 0 &&
    context.nextMasteryLevelTitle
  ) {
    messages.push({
      kind: 'mastery',
      title: `${context.pointsToNextLevel} pts to ${context.nextMasteryLevelTitle}`,
      body: `Recall today to reach ${context.nextMasteryLevelTitle} mastery.`,
    });
  }

  const quizMilestones = [10, 25, 50, 100];
  const nextQuizMilestone = quizMilestones.find(
    (milestone) => milestone > context.totalQuizSessions,
  );
  if (
    nextQuizMilestone &&
    nextQuizMilestone - context.totalQuizSessions <= 10
  ) {
    const quizzesLeft = nextQuizMilestone - context.totalQuizSessions;
    messages.push({
      kind: 'quiz',
      title: `${quizzesLeft} quiz${quizzesLeft === 1 ? '' : 'zes'} to ${nextQuizMilestone}`,
      body: `Reach ${nextQuizMilestone} total quizzes to build more recall evidence.`,
    });
  }

  if (context.omegaTestAvailable && context.totalWordCount > 0) {
    messages.push({
      kind: 'quiz',
      title: 'Omega Test is ready',
      body: `Test all ${context.totalWordCount} words to check long-term recall.`,
    });
  }

  messages.push({
    kind: 'practice',
    title: 'Daily recall builds memory',
    body: 'Practice for 2 min today; retrieval helps words stick faster.',
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
