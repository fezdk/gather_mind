const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { createEmptyState, createTask, toggleTaskCompletion, toggleTaskStep, dateKeyAfter } = require('../src/model.ts');
const { captureGoalDay, goalDaySummary, historyCalendarDays, historyWeekStart, historyMonthShift, parseGoalHistory } = require('../src/goal-history.ts');
const { parseStoredState } = require('../src/stored-state.ts');
const day = '2026-09-17';
const task = (recurrence = 'daily') => createTask('Morning routine', recurrence, day, new Date(2026, 8, 17, 9), [{ id: 'a', text: 'Breakfast' }, { id: 'b', text: 'Get dressed' }]);
const stateWith = tasks => ({ ...createEmptyState(), tasks });

test('current-day completion, reopen and step Undo replace one snapshot, not append duplicates', () => {
  let state = captureGoalDay(stateWith([task()]), day);
  const initial = state.tasks[0];
  state = captureGoalDay({ ...state, tasks: [toggleTaskStep(initial, 'a', day)] }, day);
  assert.equal(state.goalHistory[0].goals[0].steps[0].completed, true);
  state = captureGoalDay({ ...state, tasks: [toggleTaskStep(state.tasks[0], 'b', day)] }, day);
  assert.equal(goalDaySummary(state.goalHistory[0]), '1 of 1 completed');
  state = captureGoalDay({ ...state, tasks: [initial] }, day);
  assert.equal(goalDaySummary(state.goalHistory[0]), '0 of 1 completed');
  assert.equal(state.goalHistory.length, 1);
  assert.equal(state.goalHistory[0].goals[0].steps[0].completed, false);
  assert.strictEqual(captureGoalDay(state, day), state);
});

test('parent completion does not fabricate checked steps', () => {
  const state = captureGoalDay(stateWith([toggleTaskCompletion(task(), day)]), day);
  assert.equal(state.goalHistory[0].goals[0].completed, true);
  assert.deepEqual(state.goalHistory[0].goals[0].steps.map(x => x.completed), [false, false]);
});

test('daily rollover freezes independent title, order and step values, even after edit/removal', () => {
  const completed = toggleTaskStep(toggleTaskStep(task(), 'a', day), 'b', day);
  let state = captureGoalDay(stateWith([completed]), day);
  const closed = JSON.stringify(state.goalHistory[0]);
  state = captureGoalDay(state, dateKeyAfter(day, 1));
  assert.equal(state.goalHistory[1].goals[0].completed, false);
  assert.deepEqual(state.goalHistory[1].goals[0].steps.map(x => x.completed), [false, false]);
  completed.title = 'Changed routine';
  completed.steps[0].text = 'Changed step';
  state = captureGoalDay({ ...state, tasks: [] }, dateKeyAfter(day, 1));
  assert.equal(JSON.stringify(state.goalHistory[0]), closed);
  assert.equal(goalDaySummary(state.goalHistory[1]), 'No goals planned');
  assert.equal(goalDaySummary(undefined), 'No saved history');
});

test('weekly and monthly completed occurrences remain recorded after next occurrence resets', () => {
  for (const recurrence of ['weekly', 'monthly']) {
    const completed = toggleTaskStep(toggleTaskStep(task(recurrence), 'a', day), 'b', day);
    let state = captureGoalDay(stateWith([completed]), day);
    assert.deepEqual(state.goalHistory[0].goals[0].steps.map(x => x.completed), [true, true]);
    state = captureGoalDay(state, completed.scheduledFor);
    assert.equal(state.goalHistory[1].goals[0].completed, false);
    assert.deepEqual(state.goalHistory[1].goals[0].steps.map(x => x.completed), [false, false]);
    assert.equal(state.goalHistory[0].goals[0].completed, true);
  }
});

test('one-offs and carry-over record the completion day; deferral follows the saved Today list', () => {
  const oneOff = task('once');
  let state = captureGoalDay(stateWith([oneOff]), day);
  const tomorrow = dateKeyAfter(day, 1);
  state = captureGoalDay({ ...state, tasks: [toggleTaskCompletion(oneOff, tomorrow)] }, tomorrow);
  assert.equal(state.goalHistory[0].goals[0].completed, false);
  assert.equal(state.goalHistory[1].goals[0].completed, true);
  state = captureGoalDay(state, dateKeyAfter(day, 2));
  assert.equal(state.goalHistory[2].goals.length, 0);
  let moved = captureGoalDay(stateWith([{ ...oneOff, scheduledFor: tomorrow, offsetCount: 1 }]), day);
  assert.equal(moved.goalHistory[0].goals.length, 0);
  moved = captureGoalDay({ ...moved, tasks: [oneOff] }, day);
  assert.equal(moved.goalHistory[0].goals.length, 1);
});

test('restart round-trip, missing days, delete all, and clock rollback do not invent or rewrite history', () => {
  let state = captureGoalDay(stateWith([task()]), day);
  state = parseStoredState(JSON.stringify(state), 'test');
  state = captureGoalDay(state, '2026-09-25');
  assert.deepEqual(state.goalHistory.map(x => x.date), [day, '2026-09-25']);
  assert.strictEqual(captureGoalDay(state, day), state);
  assert.deepEqual(createEmptyState().goalHistory, []);
});

test('v7 migration preserves existing content and never backfills incomplete old completion metadata', () => {
  const legacy = { ...stateWith([toggleTaskCompletion(task(), day)]), version: 7 };
  delete legacy.goalHistory;
  const result = parseStoredState(JSON.stringify(legacy), 'test');
  assert.equal(result.version, 8);
  assert.deepEqual(result.tasks, legacy.tasks);
  assert.deepEqual(result.goalHistory, []);
});

test('invalid, duplicate, or missing snapshot fields fail without silently erasing stored history', () => {
  const valid = captureGoalDay(stateWith([task()]), day);
  const record = valid.goalHistory[0];
  for (const history of [null, {}, [record, record], [{ ...record, date: '2026-02-30' }], [{ ...record, goals: [record.goals[0], record.goals[0]] }], [{ ...record, goals: [{ ...record.goals[0], completed: 'true' }] }], [{ ...record, goals: [{ ...record.goals[0], steps: [{ id: 'a', text: 'Step' }] }] }]]) {
    assert.equal(parseGoalHistory(history), null);
    assert.throws(() => parseStoredState(JSON.stringify({ ...valid, goalHistory: history }), 'test'), /left untouched/);
  }
});

test('calendar has Monday-first weeks, leap days, and complete padded month rows', () => {
  assert.equal(historyWeekStart('2027-01-01'), '2026-12-28');
  assert.deepEqual(historyCalendarDays('2027-01-01', 'week'), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  for (const [date, count] of [['2028-02-15', 29], ['2026-02-15', 28], ['2026-08-15', 31]]) {
    const days = historyCalendarDays(date, 'month');
    assert.equal(days.length % 7, 0);
    assert.equal(days.filter(Boolean).length, count);
    assert.equal(new Set(days.filter(Boolean)).size, count);
  }
  assert.equal(historyMonthShift('2026-12-31', 1), '2027-01-01');
});

test('local calendar and snapshots remain day-based across Danish daylight-saving changes', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Copenhagen';
  try {
    assert.equal(dateKeyAfter('2026-03-29', 1), '2026-03-30');
    assert.equal(dateKeyAfter('2026-10-25', 1), '2026-10-26');
    assert.equal(historyCalendarDays('2026-10-25', 'week').at(-1), '2026-10-25');
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
