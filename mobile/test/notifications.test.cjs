const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(output, filename);
};

let notificationHandler;
let scheduledExisting = [];
let presentedExisting = [];
const channelCalls = [];
const scheduledCalls = [];
const cancelled = [];
const dismissed = [];

const notificationMock = {
  AndroidImportance: { MIN: 'min', HIGH: 'high' },
  AndroidNotificationPriority: { MIN: 'min' },
  AndroidNotificationVisibility: { PRIVATE: 'private' },
  IosAuthorizationStatus: { PROVISIONAL: 'provisional' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: (handler) => { notificationHandler = handler; },
  setNotificationChannelAsync: async (id, configuration) => { channelCalls.push({ id, configuration }); },
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  getAllScheduledNotificationsAsync: async () => scheduledExisting,
  getPresentedNotificationsAsync: async () => presentedExisting,
  scheduleNotificationAsync: async (request) => { scheduledCalls.push(request); return request.identifier; },
  cancelScheduledNotificationAsync: async (identifier) => { cancelled.push(identifier); },
  dismissNotificationAsync: async (identifier) => { dismissed.push(identifier); },
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'expo-notifications') return notificationMock;
  if (request === 'react-native') return { Platform: { OS: 'android' } };
  return originalLoad.call(this, request, parent, isMain);
};
const {
  DAILY_STATUS_KIND,
  clearDailyGoalStatus,
  configureNotifications,
  reconcileDailyGoalStatus,
} = require('../src/notifications.ts');
Module._load = originalLoad;

const task = {
  id: 'private-task',
  title: 'A private title that must not enter the notification',
  scheduledFor: '2026-08-18',
  completedOn: null,
  recurrence: 'once',
  recurrenceAnchor: '2026-08-18',
  offsetCount: 0,
  createdAt: '2026-08-18T08:00:00.000Z',
};

test('quiet goal status uses a private non-interruptive channel and payload', async () => {
  await configureNotifications();
  const channel = channelCalls.find((item) => item.id === 'daily-goal-status-v1');
  assert.equal(channel.configuration.importance, 'min');
  assert.equal(channel.configuration.sound, null);
  assert.equal(channel.configuration.enableVibrate, false);
  assert.equal(channel.configuration.showBadge, false);

  await reconcileDailyGoalStatus([task], true, 18 * 60, false, new Date(2026, 7, 18, 17, 0));
  assert.equal(scheduledCalls.length, 7);
  const first = scheduledCalls[0];
  assert.equal(first.content.title, '1 unfinished goal on today’s list');
  assert.equal(first.content.body, 'Open Gather Mind when you’re ready.');
  assert.equal(first.content.sound, false);
  assert.equal(first.content.priority, 'min');
  assert.equal(first.content.interruptionLevel, 'passive');
  assert.equal(first.content.data.kind, DAILY_STATUS_KIND);
  assert.equal(JSON.stringify(first.content).includes(task.title), false);
  assert.equal(first.trigger.channelId, 'daily-goal-status-v1');

  const quietBehavior = await notificationHandler.handleNotification({ request: { content: { data: { kind: DAILY_STATUS_KIND } } } });
  assert.deepEqual(quietBehavior, { shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false });
  const reminderBehavior = await notificationHandler.handleNotification({ request: { content: { data: { appointmentId: 'appointment' } } } });
  assert.deepEqual(reminderBehavior, { shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
});

test('disabling quiet status leaves appointment notifications untouched', async () => {
  scheduledExisting = [
    { identifier: 'appointment-reminder', content: { data: { appointmentId: 'appointment' } } },
    { identifier: 'gather-mind-daily-status-2026-08-18', content: { data: { kind: DAILY_STATUS_KIND } } },
  ];
  presentedExisting = [
    { request: { identifier: 'delivered-appointment', content: { data: { appointmentId: 'appointment' } } } },
    { request: { identifier: 'gather-mind-daily-status-2026-08-17', content: { data: { kind: DAILY_STATUS_KIND } } } },
  ];
  await clearDailyGoalStatus();
  assert.deepEqual(cancelled, ['gather-mind-daily-status-2026-08-18']);
  assert.deepEqual(dismissed, ['gather-mind-daily-status-2026-08-17']);
});
