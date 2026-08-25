const fs = require('node:fs');
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

const {
  canPostponeTask,
  createEmptyState,
  createGoalFromThought,
  createTask,
  dateKeyAfter,
  groupUpcomingAppointments,
  localDateKey,
  nextTaskOccurrence,
  relatedThoughts,
  removeLegacySeedData,
  searchThoughts,
  suggestedAppointments,
  suggestedTags,
  taskCarryOverLabel,
  taskStepSummary,
  tasksForToday,
  tasksForTomorrow,
  tasksScheduledAhead,
  thoughtsWithTag,
  toggleTaskCompletion,
  toggleTaskStep,
  unlinkedThoughts,
  updateTaskSchedule,
  updateTaskSteps,
} = require('../src/model.ts');
const { parseEditorDraft, parseStoredState } = require('../src/stored-state.ts');
const { dailyStatusPlan, unfinishedGoalCount, validDailyStatusMinutes } = require('../src/daily-status.ts');

const today = '2026-08-18';
const baseTask = {
  id: 'task',
  title: 'A goal',
  scheduledFor: today,
  completedOn: null,
  recurrence: 'once',
  recurrenceAnchor: today,
  offsetCount: 0,
  createdAt: '2026-08-18T08:00:00.000Z',
  steps: [],
};

test('new installations start with no demo or personal data', () => {
  assert.deepEqual(createEmptyState(), {
    version: 6,
    thoughts: [],
    appointments: [],
    tasks: [],
    health: { enabled: false, cycleTrackingEnabled: false, checkIns: [], periods: [] },
  });
});

test('encrypted storage keeps current state and migrates the previous state shape', () => {
  const current = createEmptyState();
  current.thoughts.push({ id: 'kept' });
  assert.deepEqual(parseStoredState(JSON.stringify(current), 'test storage'), current);

  const legacy = { version: 1, thoughts: [{ id: 'legacy' }], appointments: [] };
  assert.deepEqual(parseStoredState(JSON.stringify(legacy), 'test storage'), {
    version: 6,
    thoughts: [{ id: 'legacy' }],
    appointments: [],
    tasks: [],
    health: { enabled: false, cycleTrackingEnabled: false, checkIns: [], periods: [] },
  });

  const versionFive = {
    version: 5,
    thoughts: [],
    appointments: [],
    tasks: [],
    health: { enabled: true, checkIns: [{ date: today, mood: 3, sleep: null }], cycleStarts: ['2026-08-18', '2026-07-20'] },
  };
  assert.deepEqual(parseStoredState(JSON.stringify(versionFive), 'test storage'), {
    version: 6,
    thoughts: [],
    appointments: [],
    tasks: [],
    health: {
      enabled: true,
      cycleTrackingEnabled: true,
      checkIns: [{ date: today, mood: 3, sleep: null }],
      periods: [{ start: '2026-08-18', end: null }, { start: '2026-07-20', end: null }],
    },
  });
  assert.equal(parseStoredState(JSON.stringify({ ...versionFive, health: { ...versionFive.health, enabled: false } }), 'test storage').health.cycleTrackingEnabled, false);

  const versionFour = { version: 4, thoughts: [], appointments: [], tasks: [baseTask] };
  assert.deepEqual(parseStoredState(JSON.stringify(versionFour), 'test storage'), {
    version: 6,
    thoughts: [],
    appointments: [],
    tasks: [baseTask],
    health: { enabled: false, cycleTrackingEnabled: false, checkIns: [], periods: [] },
  });

  const versionThree = {
    version: 3,
    thoughts: [],
    appointments: [],
    tasks: [{ ...baseTask, steps: undefined }],
  };
  delete versionThree.tasks[0].steps;
  assert.deepEqual(parseStoredState(JSON.stringify(versionThree), 'test storage'), {
    version: 6,
    thoughts: [],
    appointments: [],
    tasks: [baseTask],
    health: { enabled: false, cycleTrackingEnabled: false, checkIns: [], periods: [] },
  });

  const versionTwo = {
    version: 2,
    thoughts: [],
    appointments: [],
    tasks: [
      { id: 'once', title: 'Once', scheduledFor: today, completedOn: null, isDaily: false, offsetCount: 1, createdAt: 'now' },
      { id: 'daily', title: 'Daily', scheduledFor: today, completedOn: null, isDaily: true, offsetCount: 0, createdAt: 'now' },
    ],
  };
  assert.deepEqual(parseStoredState(JSON.stringify(versionTwo), 'test storage').tasks, [
    { id: 'once', title: 'Once', scheduledFor: today, completedOn: null, offsetCount: 1, createdAt: 'now', recurrence: 'once', recurrenceAnchor: today, steps: [] },
    { id: 'daily', title: 'Daily', scheduledFor: today, completedOn: null, offsetCount: 0, createdAt: 'now', recurrence: 'daily', recurrenceAnchor: today, steps: [] },
  ]);
});

test('unreadable stored content fails without being replaced by empty state', () => {
  assert.throws(() => parseStoredState('{not json', 'test storage'), /left untouched/);
  assert.throws(() => parseStoredState(JSON.stringify({ version: 99 }), 'test storage'), /left untouched/);
  const current = createEmptyState();
  assert.throws(() => parseStoredState(JSON.stringify({ ...current, health: { enabled: true, cycleTrackingEnabled: true, checkIns: [{ date: today, mood: 6, sleep: null }], periods: [] } }), 'test storage'), /left untouched/);
  assert.throws(() => parseStoredState(JSON.stringify({ ...current, health: { enabled: true, cycleTrackingEnabled: true, checkIns: [], periods: [{ start: 'not-a-date', end: null }] } }), 'test storage'), /left untouched/);
  assert.throws(() => parseStoredState(JSON.stringify({ ...current, health: { enabled: true, cycleTrackingEnabled: true, checkIns: [], periods: [{ start: '2026-08-01', end: '2026-07-31' }] } }), 'test storage'), /left untouched/);
  assert.throws(() => parseStoredState(JSON.stringify({ ...current, health: { enabled: true, cycleTrackingEnabled: true, checkIns: [], periods: [{ start: '2026-08-20', end: null }, { start: '2026-08-01', end: '2026-08-20' }] } }), 'test storage'), /left untouched/);
});

test('encrypted editor drafts accept supported forms and reject malformed content', () => {
  const appointmentDraft = {
    kind: 'appointment', itemId: null, title: 'Dentist', startsAt: '2026-08-21T10:00:00.000Z',
    location: 'Clinic', reminderMinutes: 60,
  };
  assert.deepEqual(parseEditorDraft(JSON.stringify(appointmentDraft)), appointmentDraft);
  assert.deepEqual(parseEditorDraft(JSON.stringify({ kind: 'task', itemId: null, title: 'Bins', recurrence: 'weekly', scheduledFor: '2026-08-25', steps: [{ id: 'first', text: 'Find the bins' }] })), { kind: 'task', itemId: null, title: 'Bins', recurrence: 'weekly', scheduledFor: '2026-08-25', steps: [{ id: 'first', text: 'Find the bins' }] });
  assert.deepEqual(parseEditorDraft(JSON.stringify({ kind: 'task', itemId: null, title: 'Water', isDaily: true })), { kind: 'task', itemId: null, title: 'Water', recurrence: 'daily', steps: [] });
  assert.equal(parseEditorDraft(JSON.stringify({ kind: 'task', itemId: null, title: 'Bins', recurrence: 'weekly', scheduledFor: 'not-a-date' })), null);
  assert.equal(parseEditorDraft(JSON.stringify({ kind: 'task', itemId: null, title: 'Bins', recurrence: 'weekly', steps: [{ id: 'same', text: 'One' }, { id: 'same', text: 'Two' }] })), null);
  assert.equal(parseEditorDraft('{not json'), null);
  assert.equal(parseEditorDraft(JSON.stringify({ ...appointmentDraft, reminderMinutes: 'soon' })), null);
  assert.equal(parseEditorDraft(JSON.stringify({ kind: 'unknown', text: 'private' })), null);
});

test('pre-release seed records are removed without deleting user-created records', () => {
  const state = createEmptyState();
  state.appointments.push({ id: 'appointment_demo_doctor' });
  state.thoughts.push(
    { id: 'thought_sleep', appointmentId: 'appointment_demo_doctor' },
    { id: 'mine', appointmentId: 'appointment_demo_doctor' },
  );
  state.tasks.push({ id: 'task_medication' }, { id: 'mine' });
  const cleaned = removeLegacySeedData(state);
  assert.deepEqual(cleaned.appointments, []);
  assert.deepEqual(cleaned.thoughts, [{ id: 'mine', appointmentId: '' }]);
  assert.deepEqual(cleaned.tasks, [{ id: 'mine' }]);
});

test('date keys advance safely over month boundaries', () => {
  assert.equal(dateKeyAfter('2026-08-31', 1), '2026-09-01');
  assert.equal(localDateKey(new Date(2026, 7, 18, 23, 30)), today);
});

test('completed goals remain visible for the current day', () => {
  const completed = { ...baseTask, completedOn: today };
  assert.deepEqual(tasksForToday([completed], today).map((task) => task.id), ['task']);
});

test('daily essentials reappear unchecked on a new day', () => {
  const daily = { ...baseTask, recurrence: 'daily', completedOn: '2026-08-17' };
  const visible = tasksForToday([daily], today);
  assert.equal(visible.length, 1);
  assert.notEqual(visible[0].completedOn, today);
});

test('open non-daily goals get a calm carry-over label without marking daily or completed goals', () => {
  assert.equal(taskCarryOverLabel({ ...baseTask, scheduledFor: '2026-08-17' }, today), 'Planned yesterday');
  assert.equal(taskCarryOverLabel({ ...baseTask, recurrence: 'weekly', scheduledFor: '2026-08-15' }, today), 'Planned 3 days ago');
  assert.equal(taskCarryOverLabel({ ...baseTask, recurrence: 'daily', scheduledFor: '2026-08-15' }, today), '');
  assert.equal(taskCarryOverLabel({ ...baseTask, scheduledFor: '2026-08-17', completedOn: today }, today), '');
  assert.equal(taskCarryOverLabel(baseTask, today), '');
});

test('quiet daily status counts unfinished goals for each local day', () => {
  const tasks = [
    baseTask,
    { ...baseTask, id: 'daily', recurrence: 'daily', completedOn: today },
    { ...baseTask, id: 'weekly', recurrence: 'weekly', scheduledFor: '2026-08-20' },
    { ...baseTask, id: 'done', completedOn: today },
  ];
  assert.equal(unfinishedGoalCount(tasks, today), 1);
  assert.equal(unfinishedGoalCount(tasks, '2026-08-19'), 2);
  assert.equal(unfinishedGoalCount(tasks, '2026-08-20'), 3);

  const plan = dailyStatusPlan(tasks, 18 * 60, new Date(2026, 7, 18, 17, 0), false, 3);
  assert.deepEqual(plan.map((item) => [item.dateKey, item.count, item.target.getHours()]), [
    ['2026-08-18', 1, 18],
    ['2026-08-19', 2, 18],
    ['2026-08-20', 3, 18],
  ]);
});

test('quiet daily status can appear immediately after its chosen time without accepting invalid times', () => {
  const afterTime = new Date(2026, 7, 18, 19, 0);
  assert.equal(dailyStatusPlan([baseTask], 18 * 60, afterTime, false, 1).length, 0);
  const immediate = dailyStatusPlan([baseTask], 18 * 60, afterTime, true, 1)[0];
  assert.equal(immediate.target.getTime(), afterTime.getTime() + 1000);
  assert.equal(validDailyStatusMinutes(0), true);
  assert.equal(validDailyStatusMinutes(1439), true);
  assert.equal(validDailyStatusMinutes(1440), false);
  assert.throws(() => dailyStatusPlan([baseTask], 1440, afterTime), /Unsupported daily status time/);
});

test('weekly and monthly recurrence preserve their calendar rhythm', () => {
  assert.equal(nextTaskOccurrence('2026-08-18', '2026-08-18', 'weekly'), '2026-08-25');
  assert.equal(nextTaskOccurrence('2026-08-18', '2026-09-02', 'weekly'), '2026-09-08');
  assert.equal(nextTaskOccurrence('2026-01-31', '2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextTaskOccurrence('2026-01-31', '2026-02-28', 'monthly'), '2026-03-31');
});

test('one-off and recurring goals can start on a future planned date', () => {
  const now = new Date(2026, 7, 18, 10, 0);
  const daily = createTask('Medicine', 'daily', '2026-08-25', now);
  assert.equal(daily.scheduledFor, '2026-08-25');
  assert.equal(daily.recurrenceAnchor, '2026-08-25');
  assert.equal(tasksForToday([daily], today).length, 0);
  assert.deepEqual(tasksScheduledAhead([daily], today).map((task) => task.id), [daily.id]);
  assert.deepEqual(tasksForToday([daily], '2026-08-25').map((task) => task.id), [daily.id]);
  assert.deepEqual(tasksForToday([daily], '2026-08-26').map((task) => task.id), [daily.id]);

  const weekly = createTask('Bins', 'weekly', '2026-08-25', now);
  assert.equal(weekly.scheduledFor, '2026-08-25');
  assert.equal(weekly.recurrenceAnchor, '2026-08-25');
  assert.equal(tasksForToday([weekly], today).length, 0);
  assert.deepEqual(tasksScheduledAhead([weekly], today).map((task) => task.id), [weekly.id]);

  const oneOff = createTask('Call', 'once', '2026-08-25', now);
  assert.equal(oneOff.scheduledFor, '2026-08-25');
  assert.equal(oneOff.recurrenceAnchor, '2026-08-25');
  assert.equal(oneOff.offsetCount, 0);
  assert.equal(tasksForToday([oneOff], today).length, 0);
  assert.deepEqual(tasksScheduledAhead([oneOff], today).map((task) => task.id), [oneOff.id]);
  assert.deepEqual(tasksForToday([oneOff], '2026-08-25').map((task) => task.id), [oneOff.id]);
  assert.deepEqual(tasksForToday([oneOff], '2026-08-26').map((task) => task.id), [oneOff.id]);
  assert.equal(taskCarryOverLabel(oneOff, '2026-08-26'), 'Planned yesterday');
  const oneOffTomorrow = createTask('Post letter', 'once', '2026-08-19', now);
  assert.equal(oneOffTomorrow.offsetCount, 0);
  assert.deepEqual(tasksForTomorrow([oneOffTomorrow], today).map((task) => task.id), [oneOffTomorrow.id]);
  const pastOneOff = createTask('Past', 'once', '2026-08-01', now);
  assert.equal(pastOneOff.scheduledFor, today);
  const pastMonthly = createTask('Budget', 'monthly', '2026-08-01', now);
  assert.equal(pastMonthly.scheduledFor, today);
});

test('editing the next recurring date resets the calendar rhythm and move allowance', () => {
  const movedWeekly = { ...baseTask, recurrence: 'weekly', offsetCount: 2 };
  const rescheduled = updateTaskSchedule(movedWeekly, 'weekly', '2026-08-28', today);
  assert.equal(rescheduled.scheduledFor, '2026-08-28');
  assert.equal(rescheduled.recurrenceAnchor, '2026-08-28');
  assert.equal(rescheduled.offsetCount, 0);

  const completed = { ...movedWeekly, completedOn: today };
  const completedAndRescheduled = updateTaskSchedule(completed, 'weekly', '2026-08-28', today);
  assert.equal(completedAndRescheduled.completedOn, today);
  assert.equal(completedAndRescheduled.scheduledFor, '2026-08-28');
  assert.deepEqual(completedAndRescheduled.completedOccurrence, { scheduledFor: today, offsetCount: 2 });

  const daily = { ...baseTask, recurrence: 'daily', completedOn: '2026-08-17' };
  const delayedDaily = updateTaskSchedule(daily, 'daily', '2026-08-19', today);
  assert.equal(delayedDaily.scheduledFor, '2026-08-19');
  assert.equal(delayedDaily.recurrenceAnchor, '2026-08-19');
  assert.deepEqual(tasksForTomorrow([delayedDaily], today).map((task) => task.id), ['task']);

  const movedOneOff = { ...baseTask, offsetCount: 3 };
  const plannedOneOff = updateTaskSchedule(movedOneOff, 'once', '2026-08-22', today);
  assert.equal(plannedOneOff.scheduledFor, '2026-08-22');
  assert.equal(plannedOneOff.recurrenceAnchor, '2026-08-22');
  assert.equal(plannedOneOff.offsetCount, 0);
  assert.equal(plannedOneOff.completedOn, null);

  const completedOneOff = { ...baseTask, completedOn: today };
  const reusedForFuture = updateTaskSchedule(completedOneOff, 'once', '2026-08-22', today);
  assert.equal(reusedForFuture.scheduledFor, '2026-08-22');
  assert.equal(reusedForFuture.completedOn, null);

  const overdueUnchanged = { ...baseTask, scheduledFor: '2026-08-15' };
  assert.equal(updateTaskSchedule(overdueUnchanged, 'once', '2026-08-15', today), overdueUnchanged);
});

test('scheduled-ahead goals include future one-offs but exclude tomorrow and the occurrence completed today', () => {
  const tomorrow = { ...baseTask, id: 'tomorrow', recurrence: 'weekly', scheduledFor: '2026-08-19' };
  const tomorrowOnce = { ...baseTask, id: 'tomorrow-once', scheduledFor: '2026-08-19' };
  const futureDaily = { ...baseTask, id: 'daily', recurrence: 'daily', scheduledFor: '2026-08-22' };
  const futureOnce = { ...baseTask, id: 'once', scheduledFor: '2026-08-23' };
  const nextWeek = { ...baseTask, id: 'next-week', recurrence: 'weekly', scheduledFor: '2026-08-25' };
  const completed = { ...baseTask, id: 'completed', recurrence: 'monthly', scheduledFor: '2026-09-18', completedOn: today };
  assert.deepEqual(tasksScheduledAhead([completed, nextWeek, tomorrow, tomorrowOnce, futureOnce, futureDaily], today).map((task) => task.id), ['daily', 'once', 'next-week']);
});

test('weekly goals allow two moves and monthly goals allow five per occurrence', () => {
  assert.equal(canPostponeTask({ ...baseTask, recurrence: 'weekly', offsetCount: 1 }), true);
  assert.equal(canPostponeTask({ ...baseTask, recurrence: 'weekly', offsetCount: 2 }), false);
  assert.equal(canPostponeTask({ ...baseTask, recurrence: 'monthly', offsetCount: 4 }), true);
  assert.equal(canPostponeTask({ ...baseTask, recurrence: 'monthly', offsetCount: 5 }), false);
  assert.equal(canPostponeTask({ ...baseTask, recurrence: 'once', offsetCount: 99 }), true);
  assert.equal(canPostponeTask({ ...baseTask, recurrence: 'daily' }), false);
});

test('completing a recurring goal advances and resets its move allowance, while reopen restores it', () => {
  const movedWeekly = { ...baseTask, recurrence: 'weekly', scheduledFor: '2026-08-20', offsetCount: 2 };
  const completed = toggleTaskCompletion(movedWeekly, '2026-08-20');
  assert.equal(completed.completedOn, '2026-08-20');
  assert.equal(completed.scheduledFor, '2026-08-25');
  assert.equal(completed.offsetCount, 0);
  assert.deepEqual(completed.completedOccurrence, { scheduledFor: '2026-08-20', offsetCount: 2 });
  assert.deepEqual(toggleTaskCompletion(completed, '2026-08-20'), movedWeekly);
});

test('goal steps stay inside their parent and the last check completes the goal', () => {
  const task = {
    ...baseTask,
    steps: [{ id: 'first', text: 'Find the number' }, { id: 'second', text: 'Make the call' }],
  };
  const afterFirst = toggleTaskStep(task, 'first', today);
  assert.equal(afterFirst.completedOn, null);
  assert.deepEqual(taskStepSummary(afterFirst, today), {
    total: 2,
    completed: 1,
    completedStepIds: ['first'],
    nextStep: { id: 'second', text: 'Make the call' },
  });

  const completed = toggleTaskStep(afterFirst, 'second', today);
  assert.equal(completed.completedOn, today);
  assert.deepEqual(taskStepSummary(completed, today).completedStepIds, ['first', 'second']);
});

test('daily step checks reset on the next day without changing their definitions', () => {
  const daily = {
    ...baseTask,
    recurrence: 'daily',
    steps: [{ id: 'morning', text: 'Take the tablet' }],
  };
  const completed = toggleTaskStep(daily, 'morning', today);
  assert.equal(taskStepSummary(completed, today).completed, 1);
  assert.deepEqual(taskStepSummary(completed, '2026-08-19'), {
    total: 1,
    completed: 0,
    completedStepIds: [],
    nextStep: { id: 'morning', text: 'Take the tablet' },
  });
});

test('recurring goals preserve step progress when moved and restore it when reopened', () => {
  const weekly = {
    ...baseTask,
    recurrence: 'weekly',
    steps: [{ id: 'wash', text: 'Wash clothes' }, { id: 'fold', text: 'Fold clothes' }],
  };
  const inProgress = toggleTaskStep(weekly, 'wash', today);
  const moved = { ...inProgress, scheduledFor: '2026-08-19', offsetCount: 1 };
  assert.equal(taskStepSummary(moved, '2026-08-19').completed, 1);

  const completed = toggleTaskCompletion(moved, '2026-08-19');
  assert.equal(taskStepSummary(completed, '2026-08-19').completed, 1);
  assert.equal(taskStepSummary(completed, '2026-08-25').completed, 0);
  const reopened = toggleTaskCompletion(completed, '2026-08-19');
  assert.equal(reopened.scheduledFor, '2026-08-19');
  assert.equal(reopened.offsetCount, 1);
  assert.equal(taskStepSummary(reopened, '2026-08-19').completed, 1);
});

test('editing goal steps keeps valid checks and drops removed ones', () => {
  const inProgress = {
    ...baseTask,
    steps: [{ id: 'keep', text: 'Keep this' }, { id: 'remove', text: 'Remove this' }],
    stepProgress: { occurrence: today, completedStepIds: ['keep', 'remove'] },
  };
  const edited = updateTaskSteps(inProgress, [{ id: 'keep', text: 'Renamed step' }, { id: 'blank', text: '   ' }]);
  assert.deepEqual(edited.steps, [{ id: 'keep', text: 'Renamed step' }]);
  assert.deepEqual(edited.stepProgress, { occurrence: today, completedStepIds: ['keep'] });
});

test('removing every goal step also removes its stored occurrence progress', () => {
  const inProgress = {
    ...baseTask,
    steps: [{ id: 'only', text: 'Only step' }],
    stepProgress: { occurrence: today, completedStepIds: ['only'] },
    completedOccurrence: {
      scheduledFor: today,
      offsetCount: 1,
      stepProgress: { occurrence: today, completedStepIds: ['only'] },
    },
  };
  const edited = updateTaskSteps(inProgress, []);
  assert.deepEqual(edited.steps, []);
  assert.equal(edited.stepProgress, undefined);
  assert.deepEqual(edited.completedOccurrence, { scheduledFor: today, offsetCount: 1 });
});

test('a recurring goal reappears when its next scheduled occurrence is due', () => {
  const weekly = { ...baseTask, recurrence: 'weekly', completedOn: '2026-08-18', scheduledFor: '2026-08-25' };
  assert.equal(tasksForToday([weekly], '2026-08-24').length, 0);
  assert.deepEqual(tasksForToday([weekly], '2026-08-25').map((task) => task.id), ['task']);
});

test('postponed goals leave today and appear in tomorrow preview', () => {
  const postponed = { ...baseTask, scheduledFor: '2026-08-19', offsetCount: 1 };
  assert.equal(tasksForToday([postponed], today).length, 0);
  assert.deepEqual(tasksForTomorrow([postponed], today).map((task) => task.id), ['task']);
});

test('today goals keep their saved order after completion and postponement changes', () => {
  const calm = { ...baseTask, id: 'calm' };
  const moved = { ...baseTask, id: 'moved', offsetCount: 3 };
  const completed = { ...baseTask, id: 'completed', completedOn: today };
  assert.deepEqual(tasksForToday([calm, moved, completed], today).map((task) => task.id), ['calm', 'moved', 'completed']);
});

const thought = (id, text, tags = [], createdAt = '2026-08-18T08:00:00.000Z') => ({
  id, text, tags, appointmentId: '', createdAt,
});

test('a thought becomes a one-off goal today while retaining its source link', () => {
  const source = thought('source', 'Call the clinic', ['health']);
  const goal = createGoalFromThought(source, today, new Date('2026-08-18T09:30:00.000Z'));
  assert.match(goal.id, /^task_/);
  assert.deepEqual({ ...goal, id: 'stable' }, {
    id: 'stable',
    title: 'Call the clinic',
    scheduledFor: today,
    completedOn: null,
    recurrence: 'once',
    recurrenceAnchor: today,
    offsetCount: 0,
    createdAt: '2026-08-18T09:30:00.000Z',
    steps: [],
    sourceThoughtId: 'source',
  });
});

test('thought search filters for short and common-word queries instead of returning everything', () => {
  const thoughts = [
    thought('meeting', 'Ask me about the project', ['work']),
    thought('sleep', 'Track sleep quality', ['health']),
  ];

  assert.deepEqual(searchThoughts(thoughts, 'me').map((item) => item.id), ['meeting']);
  assert.deepEqual(searchThoughts(thoughts, 'the').map((item) => item.id), ['meeting']);
  assert.deepEqual(searchThoughts(thoughts, 'missing'), []);
});

test('thought search matches themes and ignores accents and case', () => {
  const thoughts = [
    thought('doctor', 'Book an appointment', ['Søvn']),
    thought('coffee', 'Buy café beans', ['errands']),
  ];

  assert.deepEqual(searchThoughts(thoughts, 'SØVN').map((item) => item.id), ['doctor']);
  assert.deepEqual(searchThoughts(thoughts, 'cafe').map((item) => item.id), ['coffee']);
});

test('saved-theme filtering matches the complete tag instead of its individual words', () => {
  const thoughts = [
    thought('multi-word', 'Recover after meeting people', ['Me social']),
    thought('single-word', 'Plan a party', ['social']),
    thought('text-only', 'Reflect on me social situations', ['reflection']),
  ];

  assert.deepEqual(thoughtsWithTag(thoughts, 'me social').map((item) => item.id), ['multi-word']);
  assert.deepEqual(thoughtsWithTag(thoughts, 'ME SOCIAL').map((item) => item.id), ['multi-word']);
  assert.deepEqual(thoughtsWithTag(thoughts, 'social').map((item) => item.id), ['single-word']);
});

test('thought relations rank shared themes and expose the local matching reason', () => {
  const focus = { ...thought('focus', 'Prepare sleep questions', ['Søvn', 'health']), appointmentId: 'doctor' };
  const themed = thought('themed', 'Track rest', ['søvn']);
  const wordMatch = thought('words', 'Sleep routine and questions');
  const appointmentMatch = { ...thought('appointment', 'Bring documents'), appointmentId: 'doctor' };
  const unrelated = thought('unrelated', 'Buy coffee beans', ['errands']);

  const relations = relatedThoughts([focus, wordMatch, unrelated, appointmentMatch, themed], focus.id);
  assert.deepEqual(relations.map((relation) => relation.thought.id), ['themed', 'words', 'appointment']);
  assert.deepEqual(relations[0].sharedTags, ['Søvn']);
  assert.deepEqual(relations[1].sharedWords, ['sleep', 'questions']);
  assert.equal(relations[2].sharesAppointment, true);
});

test('common Danish words do not create false thought relations', () => {
  const first = thought('first', 'Jeg skal ringe til lægen');
  const second = thought('second', 'Jeg skal købe mælk');
  assert.deepEqual(relatedThoughts([first, second], first.id), []);
});

test('tag suggestions reuse stored themes, ranked by frequency', () => {
  const thoughts = [
    thought('one', 'One', ['health', 'sleep']),
    thought('two', 'Two', ['health', 'work']),
    thought('three', 'Three', ['Health']),
  ];

  assert.deepEqual(suggestedTags(thoughts), ['health', 'sleep', 'work']);
  assert.deepEqual(suggestedTags(thoughts, ['health'], 'wo'), ['work']);
});

test('tag suggestions prefer themes already used with nearby appointment context', () => {
  const thoughts = [
    { ...thought('one', 'One', ['work']), appointmentId: 'meeting' },
    thought('two', 'Two', ['health']),
    thought('three', 'Three', ['health']),
  ];

  assert.deepEqual(suggestedTags(thoughts, [], '', 8, ['meeting']), ['work', 'health']);
});

test('appointment suggestions stay near today and prefer local text matches', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  const appointment = (id, title, startsAt) => ({
    id, title, startsAt, location: '', reminderMinutes: 0, notificationId: null,
    createdAt: now.toISOString(), agenda: [],
  });
  const recent = appointment('recent', 'Check-in', '2026-08-17T12:00:00.000Z');
  const soon = appointment('soon', 'Dentist', '2026-08-22T12:00:00.000Z');
  const matching = appointment('matching', 'Sleep clinic', '2026-09-09T12:00:00.000Z');
  const tooOld = appointment('old', 'Old visit', '2026-08-12T12:00:00.000Z');
  const tooLate = appointment('late', 'Later visit', '2026-09-20T13:00:00.000Z');

  const suggestions = suggestedAppointments([recent, soon, matching, tooOld, tooLate], [], 'Questions about sleep', now);
  assert.deepEqual(suggestions.map((item) => item.appointment.id), ['matching', 'soon', 'recent']);
  assert.deepEqual(suggestions[0].sharedWords, ['sleep']);
});

test('appointment suggestions can match themes from already linked thoughts', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  const appointment = {
    id: 'doctor', title: 'Doctor', startsAt: '2026-08-24T12:00:00.000Z', location: '',
    reminderMinutes: 0, notificationId: null, createdAt: now.toISOString(), agenda: [],
  };
  const linked = { ...thought('linked', 'Previous observation', ['hormones']), appointmentId: appointment.id };

  const [suggestion] = suggestedAppointments([appointment], [linked], 'Ask about hormones', now);
  assert.deepEqual(suggestion.sharedWords, ['hormones']);
});

test('loose thoughts exclude appointment links and return when unlinked', () => {
  const loose = thought('loose', 'Loose thought');
  const linked = { ...thought('linked', 'Appointment thought'), appointmentId: 'appointment' };

  assert.deepEqual(unlinkedThoughts([loose, linked]).map((item) => item.id), ['loose']);
  assert.deepEqual(unlinkedThoughts([loose, { ...linked, appointmentId: '' }]).map((item) => item.id), ['loose', 'linked']);
});


test('appointments are sorted and grouped into a calendar-like daily agenda', () => {
  const now = new Date(2026, 7, 18, 9, 0);
  const appointment = (id, date) => ({ id, startsAt: date.toISOString() });
  const groups = groupUpcomingAppointments([
    appointment('later', new Date(2026, 7, 20, 15, 0)),
    appointment('past', new Date(2026, 7, 17, 15, 0)),
    appointment('first', new Date(2026, 7, 19, 9, 0)),
    appointment('same-day', new Date(2026, 7, 19, 14, 0)),
  ], now);

  assert.deepEqual(groups.map((group) => ({
    dateKey: group.dateKey,
    ids: group.appointments.map((item) => item.id),
  })), [
    { dateKey: '2026-08-19', ids: ['first', 'same-day'] },
    { dateKey: '2026-08-20', ids: ['later'] },
  ]);
});
