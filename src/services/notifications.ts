import type * as ExpoNotifications from 'expo-notifications';
import { Platform } from 'react-native';
import { COLORS } from '../constants/theme';
import type { ReminderSettings } from '../types';

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
  if (settings.notificationId && Platform.OS !== 'web') {
    const Notifications = await getNotificationsModule();
    await Notifications.cancelScheduledNotificationAsync(settings.notificationId);
  }
}

export async function scheduleDailyReminder(
  settings: ReminderSettings,
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
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Keep your WordWiz streak going',
      body: 'Review a few words today so they stick.',
      data: { screen: 'quiz' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.hour,
      minute: settings.minute,
    },
  });

  return { ...settings, enabled: true, notificationId };
}
