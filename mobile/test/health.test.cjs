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
  addPeriodStart,
  clearHealthHistory,
  cycleForecast,
  cycleHistorySummary,
  cycleTodayInsight,
  healthRatingLabel,
  periodDurationDays,
  removePeriod,
  setDailyHealthRating,
  setPeriodEnd,
} = require('../src/health.ts');
const { createEmptyHealthState } = require('../src/model.ts');

test('mood and sleep save independently for one local day and selected ratings toggle off', () => {
  const date = '2026-08-25';
  let health = { ...createEmptyHealthState(), enabled: true };
  health = setDailyHealthRating(health, date, 'mood', 2);
  health = setDailyHealthRating(health, date, 'sleep', 4);
  assert.deepEqual(health.checkIns, [{ date, mood: 2, sleep: 4 }]);

  health = setDailyHealthRating(health, date, 'mood', 3);
  assert.deepEqual(health.checkIns, [{ date, mood: 3, sleep: 4 }]);
  health = setDailyHealthRating(health, date, 'mood', 3);
  assert.deepEqual(health.checkIns, [{ date, mood: null, sleep: 4 }]);
  health = setDailyHealthRating(health, date, 'sleep', 4);
  assert.deepEqual(health.checkIns, []);
});

test('periods keep valid start and optional end dates without overlapping the next period', () => {
  let health = { ...createEmptyHealthState(), enabled: true, cycleTrackingEnabled: true };
  health = addPeriodStart(health, '2026-07-29', '2026-08-25');
  health = addPeriodStart(health, '2026-08-25', '2026-08-25');
  health = addPeriodStart(health, '2026-08-25', '2026-08-25');
  health = addPeriodStart(health, '2026-08-26', '2026-08-25');
  assert.deepEqual(health.periods, [{ start: '2026-08-25', end: null }, { start: '2026-07-29', end: null }]);

  health = setPeriodEnd(health, '2026-07-29', '2026-08-03', '2026-08-25');
  assert.equal(health.periods[1].end, '2026-08-03');
  assert.equal(addPeriodStart(health, '2026-08-01', '2026-08-25'), health);
  assert.equal(setPeriodEnd(health, '2026-07-29', '2026-08-25', '2026-08-25'), health);
  assert.equal(setPeriodEnd(health, '2026-08-25', '2026-08-26', '2026-08-25'), health);
  assert.equal(periodDurationDays('2026-07-29', '2026-08-03'), 6);

  health = removePeriod(health, '2026-07-29');
  health = setDailyHealthRating(health, '2026-08-25', 'mood', 4);
  assert.deepEqual(clearHealthHistory(health), { enabled: true, cycleTrackingEnabled: true, checkIns: [], periods: [] });
});

test('forecast and history use start-to-start intervals while completed periods provide duration', () => {
  const health = {
    enabled: true,
    cycleTrackingEnabled: true,
    checkIns: [],
    periods: [
      { start: '2026-08-21', end: null },
      { start: '2026-07-24', end: '2026-07-27' },
      { start: '2026-06-25', end: '2026-06-30' },
      { start: '2026-05-28', end: '2026-06-01' },
    ],
  };
  assert.deepEqual(cycleForecast(health, '2026-09-13'), {
    estimatedStart: '2026-09-18',
    typicalCycleDays: 28,
    intervalsUsed: 3,
    rangeDays: 1,
    daysUntil: 5,
  });
  assert.deepEqual(cycleHistorySummary(health, '2026-09-13'), {
    typicalCycleDays: 28,
    cycleIntervalsUsed: 3,
    cycleRangeDays: 1,
    typicalPeriodDays: 5,
    periodDurationsUsed: 3,
    periodRangeDays: 2,
  });
  assert.match(cycleTodayInsight(health, '2026-09-13').message, /5 days/);
  assert.match(cycleTodayInsight(health, '2026-09-17').message, /tomorrow/);
  assert.match(cycleTodayInsight(health, '2026-09-18').message, /today/);
  assert.equal(cycleTodayInsight(health, '2026-09-12'), null);
  assert.equal(cycleTodayInsight({ ...health, enabled: false }, '2026-09-17'), null);
  assert.equal(cycleTodayInsight({ ...health, cycleTrackingEnabled: false }, '2026-09-17'), null);
});

test('forecast needs two useful starts and tolerates irregular cycles without treating close duplicates as cycles', () => {
  const withStarts = (...starts) => ({ enabled: true, cycleTrackingEnabled: true, checkIns: [], periods: starts.map((start) => ({ start, end: null })) });
  assert.equal(cycleForecast(withStarts('2026-08-01'), '2026-08-20'), null);
  assert.equal(cycleForecast(withStarts('2026-08-01', '2026-08-08'), '2026-08-20'), null);
  assert.equal(cycleForecast(withStarts('2026-07-01', '2026-07-29', '2026-08-05'), '2026-08-20'), null);
  assert.equal(cycleForecast(withStarts('2026-08-01', '2026-09-01'), '2026-08-20'), null);
  const irregular = cycleForecast(withStarts('2026-04-01', '2026-05-01', '2026-06-15', '2026-07-15'), '2026-08-10');
  assert.equal(irregular.typicalCycleDays, 30);
  assert.equal(irregular.rangeDays, 15);
});

test('health ratings use explicit accessible wording', () => {
  assert.equal(healthRatingLabel('mood', 1), 'Very low');
  assert.equal(healthRatingLabel('mood', 5), 'Very good');
  assert.equal(healthRatingLabel('sleep', 1), 'Very poor');
  assert.equal(healthRatingLabel('sleep', 5), 'Very good');
});
