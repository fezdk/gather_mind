import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Appointment, DailyTask, localDateKey, reminderTime } from './model';
import { dailyStatusPlan, dateAtLocalMinutes, unfinishedGoalCount } from './daily-status';
import { removePrivateReminder, runAfterReminderCancellation } from './privacy-operations';

const CHANNEL_ID = 'appointments';
const DAILY_STATUS_CHANNEL_ID = 'daily-goal-status-v1';
export const DAILY_STATUS_KIND = 'daily-goal-status';
const DAILY_STATUS_ID_PREFIX = 'gather-mind-daily-status-';
let dailyStatusQueue: Promise<void> = Promise.resolve();

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isDailyStatus = notification.request.content.data?.kind === DAILY_STATUS_KIND;
    return {
      shouldShowBanner: !isDailyStatus,
      shouldShowList: true,
      shouldPlaySound: !isDailyStatus,
      shouldSetBadge: false,
    };
  },
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
    await Notifications.setNotificationChannelAsync(DAILY_STATUS_CHANNEL_ID, {
      name: 'Quiet daily status',
      description: 'An optional quiet count of unfinished goals after your chosen time',
      importance: Notifications.AndroidImportance.MIN,
      sound: null,
      vibrationPattern: null,
      enableVibrate: false,
      enableLights: false,
      showBadge: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
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
  await removePrivateReminder({
    cancelScheduled: () => Notifications.cancelScheduledNotificationAsync(notificationId),
    dismissDelivered: () => Notifications.dismissNotificationAsync(notificationId),
  });
}

export async function scheduleReminder(appointment: Appointment) {
  return runAfterReminderCancellation(appointment.notificationId, cancelReminder, () => {
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
      const notificationId = await scheduleReminder({ ...appointment, notificationId: null });
      reconciled.push({ ...appointment, notificationId });
      changed = true;
    } else {
      reconciled.push(appointment);
    }
  }
  return changed ? reconciled : appointments;
}

function isDailyStatusRequest(request: Notifications.NotificationRequest) {
  return request.identifier.startsWith(DAILY_STATUS_ID_PREFIX)
    || request.content.data?.kind === DAILY_STATUS_KIND;
}

function enqueueDailyStatus(operation: () => Promise<void>): Promise<void> {
  const queued = dailyStatusQueue.catch(() => undefined).then(operation);
  dailyStatusQueue = queued;
  return queued;
}

async function dailyStatusRequests() {
  const [scheduled, presented] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.getPresentedNotificationsAsync(),
  ]);
  return {
    scheduled: scheduled.filter(isDailyStatusRequest),
    presented: presented.filter((notification) => isDailyStatusRequest(notification.request)),
  };
}

async function clearDailyGoalStatusNow(): Promise<void> {
  const requests = await dailyStatusRequests();
  const results = await Promise.allSettled([
    ...requests.scheduled.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
    ...requests.presented.map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)),
  ]);
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

export function clearDailyGoalStatus(): Promise<void> {
  return enqueueDailyStatus(clearDailyGoalStatusNow);
}

export function reconcileDailyGoalStatus(
  tasks: DailyTask[],
  enabled: boolean,
  minutes: number,
  includePastToday = false,
  now = new Date(),
): Promise<void> {
  return enqueueDailyStatus(async () => {
    const allowed = await notificationsEnabled();
    const requests = await dailyStatusRequests();
    if (!enabled || !allowed) {
      const results = await Promise.allSettled([
        ...requests.scheduled.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
        ...requests.presented.map((notification) => Notifications.dismissNotificationAsync(notification.request.identifier)),
      ]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      return;
    }

    const today = localDateKey(now);
    const todayCount = unfinishedGoalCount(tasks, today);
    const todayTargetReached = dateAtLocalMinutes(today, minutes).getTime() <= now.getTime();
    let currentStatusAlreadyPresented = false;
    const cleanup = [
      ...requests.scheduled.map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
      ...requests.presented.flatMap((notification) => {
        const data = notification.request.content.data;
        const matchesCurrentStatus = data?.dateKey === today && data?.count === todayCount && todayCount > 0 && todayTargetReached;
        if (matchesCurrentStatus) {
          currentStatusAlreadyPresented = true;
          return [];
        }
        return [Notifications.dismissNotificationAsync(notification.request.identifier)];
      }),
    ];
    const cleanupResults = await Promise.allSettled(cleanup);
    const cleanupFailure = cleanupResults.find((result) => result.status === 'rejected');
    if (cleanupFailure?.status === 'rejected') throw cleanupFailure.reason;

    const plan = dailyStatusPlan(tasks, minutes, now, includePastToday);
    for (const item of plan) {
      if (item.dateKey === today && currentStatusAlreadyPresented) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `${DAILY_STATUS_ID_PREFIX}${item.dateKey}`,
        content: {
          title: item.count === 1 ? '1 unfinished goal on today’s list' : `${item.count} unfinished goals on today’s list`,
          body: 'Open Gather Mind when you’re ready.',
          data: { kind: DAILY_STATUS_KIND, dateKey: item.dateKey, count: item.count },
          sound: false,
          priority: Notifications.AndroidNotificationPriority.MIN,
          interruptionLevel: 'passive',
          autoDismiss: true,
          sticky: false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.target,
          ...(Platform.OS === 'android' ? { channelId: DAILY_STATUS_CHANNEL_ID } : {}),
        },
      });
    }
  });
}
