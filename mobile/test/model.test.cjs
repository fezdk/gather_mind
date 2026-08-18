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
  createEmptyState,
  dateKeyAfter,
  groupUpcomingAppointments,
  localDateKey,
  removeLegacySeedData,
  searchThoughts,
  suggestedTags,
  tasksForToday,
  tasksForTomorrow,
} = require('../src/model.ts');

const today = '2026-08-18';
const baseTask = {
  id: 'task',
  title: 'A goal',
  scheduledFor: today,
  completedOn: null,
  isDaily: false,
  offsetCount: 0,
  createdAt: '2026-08-18T08:00:00.000Z',
};

test('new installations start with no demo or personal data', () => {
  assert.deepEqual(createEmptyState(), {
    version: 2,
    thoughts: [],
    appointments: [],
    tasks: [],
  });
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
  const daily = { ...baseTask, isDaily: true, completedOn: '2026-08-17' };
  const visible = tasksForToday([daily], today);
  assert.equal(visible.length, 1);
  assert.notEqual(visible[0].completedOn, today);
});

test('postponed goals leave today and appear in tomorrow preview', () => {
  const postponed = { ...baseTask, scheduledFor: '2026-08-19', offsetCount: 1 };
  assert.equal(tasksForToday([postponed], today).length, 0);
  assert.deepEqual(tasksForTomorrow([postponed], today).map((task) => task.id), ['task']);
});

test('more frequently moved goals sort above other unfinished goals', () => {
  const calm = { ...baseTask, id: 'calm' };
  const moved = { ...baseTask, id: 'moved', offsetCount: 3 };
  assert.deepEqual(tasksForToday([calm, moved], today).map((task) => task.id), ['moved', 'calm']);
});

const thought = (id, text, tags = [], createdAt = '2026-08-18T08:00:00.000Z') => ({
  id, text, tags, appointmentId: '', createdAt,
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

test('tag suggestions reuse stored themes, ranked by frequency', () => {
  const thoughts = [
    thought('one', 'One', ['health', 'sleep']),
    thought('two', 'Two', ['health', 'work']),
    thought('three', 'Three', ['Health']),
  ];

  assert.deepEqual(suggestedTags(thoughts), ['health', 'sleep', 'work']);
  assert.deepEqual(suggestedTags(thoughts, ['health'], 'wo'), ['work']);
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
