import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Appointment, reminderTime } from './model';

const CHANNEL_ID = 'appointments';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function configureNotifications() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Appointment reminders',
      description: 'Reminders for appointments and their preparation plans',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      lightColor: '#779887',
      sound: 'default',
    });
  }
}

function permissionAllowsNotifications(settings: Notifications.NotificationPermissionsStatus) {
  return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function notificationsEnabled() {
  return permissionAllowsNotifications(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission() {
  await configureNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (permissionAllowsNotifications(current)) return true;
  return permissionAllowsNotifications(await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  }));
}

export async function cancelReminder(notificationId: string | null | undefined) {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.warn('Could not cancel appointment reminder', error);
  }
}

export async function scheduleReminder(appointment: Appointment) {
  await cancelReminder(appointment.notificationId);
  if (!appointment.reminderMinutes) return null;
  const date = reminderTime(appointment.startsAt, appointment.reminderMinutes);
  if (date.getTime() <= Date.now()) return null;
  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Upcoming: ${appointment.title}`,
      body: 'Open Gather Mind to review your appointment plan.',
      data: { appointmentId: appointment.id },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
  });
}

export async function reconcileReminders(appointments: Appointment[]) {
  if (!(await notificationsEnabled())) return appointments;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const liveIds = new Set(scheduled.map((item) => item.identifier));
  let changed = false;
  const reconciled: Appointment[] = [];
  for (const appointment of appointments) {
    const reminderIsFuture = reminderTime(appointment.startsAt, appointment.reminderMinutes).getTime() > Date.now();
    if (appointment.reminderMinutes && reminderIsFuture && (!appointment.notificationId || !liveIds.has(appointment.notificationId))) {
      const notificationId = await scheduleReminder(appointment);
      reconciled.push({ ...appointment, notificationId });
      changed = true;
    } else {
      reconciled.push(appointment);
    }
  }
  return changed ? reconciled : appointments;
}
