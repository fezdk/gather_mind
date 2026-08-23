const fs = require('node:fs');
const path = require('node:path');
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

const { createEmptyState, createTask, dateKeyAfter } = require('../src/model.ts');
const { WIDGET_SNAPSHOT_DAYS, buildWidgetSnapshot, parseWidgetRoute } = require('../src/widget-model.ts');

const now = new Date('2026-08-23T10:00:00.000Z');
const today = '2026-08-23';

test('widget snapshots contain a bounded local summary and hide titles by default', () => {
  const state = createEmptyState();
  const open = createTask('Call the clinic', 'once', today, now);
  const completed = { ...createTask('Take medicine', 'daily', today, now), completedOn: today };
  state.tasks.push(open, completed);
  state.appointments.push(
    { id: 'past', title: 'Past appointment', startsAt: '2026-08-23T09:00:00.000Z' },
    { id: 'next', title: 'Dentist', startsAt: '2026-08-23T14:30:00.000Z' },
  );

  const privateSnapshot = buildWidgetSnapshot(state, false, now);
  assert.equal(privateSnapshot.days.length, WIDGET_SNAPSHOT_DAYS);
  assert.deepEqual(privateSnapshot.days[0], { date: today, completed: 1, total: 2, goals: [] });
  assert.deepEqual(privateSnapshot.appointments, [{ id: 'next', title: '', startsAt: Date.parse('2026-08-23T14:30:00.000Z') }]);
  assert.equal(JSON.stringify(privateSnapshot).includes('Call the clinic'), false);
  assert.equal(JSON.stringify(privateSnapshot).includes('Dentist'), false);

  const detailedSnapshot = buildWidgetSnapshot(state, true, now);
  assert.deepEqual(detailedSnapshot.days[0].goals, [{ id: open.id, title: 'Call the clinic' }]);
  assert.equal(detailedSnapshot.appointments[0].title, 'Dentist');
  assert.equal(detailedSnapshot.days.at(-1).date, dateKeyAfter(today, WIDGET_SNAPSHOT_DAYS - 1));
});

test('widget snapshots prepare recurring goals for the next local day', () => {
  const state = createEmptyState();
  state.tasks.push({ ...createTask('Take medicine', 'daily', today, now), completedOn: today });
  const snapshot = buildWidgetSnapshot(state, true, now);
  assert.deepEqual(snapshot.days[0], { date: today, completed: 1, total: 1, goals: [] });
  assert.equal(snapshot.days[1].total, 1);
  assert.equal(snapshot.days[1].completed, 0);
  assert.equal(snapshot.days[1].goals[0].title, 'Take medicine');
});

test('only Gather Mind widget deep links are accepted', () => {
  assert.deepEqual(parseWidgetRoute('gathermind://today'), { kind: 'today' });
  assert.deepEqual(parseWidgetRoute('gathermind://goal/goal%201'), { kind: 'goal', id: 'goal 1' });
  assert.deepEqual(parseWidgetRoute('gathermind://appointment/appointment-1'), { kind: 'appointment', id: 'appointment-1' });
  assert.equal(parseWidgetRoute('gathermind://goal'), null);
  assert.equal(parseWidgetRoute('gathermind://today/unexpected'), null);
  assert.equal(parseWidgetRoute('https://example.com/goal/private'), null);
});

test('the Android widget is native, encrypted, responsive, and local-only', () => {
  const moduleRoot = path.join(__dirname, '..', 'modules', 'gather-mind-widget');
  const manifest = fs.readFileSync(path.join(moduleRoot, 'android/src/main/AndroidManifest.xml'), 'utf8');
  const provider = fs.readFileSync(path.join(moduleRoot, 'android/src/main/res/xml/gather_mind_widget_info.xml'), 'utf8');
  const store = fs.readFileSync(path.join(moduleRoot, 'android/src/main/java/expo/modules/gathermindwidget/WidgetSnapshotStore.kt'), 'utf8');
  const widget = fs.readFileSync(path.join(moduleRoot, 'android/src/main/java/expo/modules/gathermindwidget/GatherMindWidget.kt'), 'utf8');
  const nativeModule = fs.readFileSync(path.join(moduleRoot, 'android/src/main/java/expo/modules/gathermindwidget/GatherMindWidgetModule.kt'), 'utf8');

  assert.match(manifest, /GatherMindWidgetReceiver/);
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  assert.match(provider, /android:targetCellWidth="1"/);
  assert.match(provider, /android:targetCellHeight="1"/);
  assert.match(provider, /android:resizeMode="horizontal\|vertical"/);
  assert.match(store, /AndroidKeyStore/);
  assert.match(store, /AES\/GCM\/NoPadding/);
  assert.match(widget, /SizeMode\.Responsive/);
  assert.match(widget, /DpSize\(180\.dp, 57\.dp\)/);
  assert.match(widget, /DpSize\(180\.dp, 96\.dp\)/);
  assert.match(widget, /contentAlignment = Alignment\.Center/);
  assert.match(widget, /All goals gathered/);
  assert.match(widget, /wideAppointmentLine/);
  assert.match(widget, /currentState\(widgetSnapshotRevisionKey\)/);
  assert.match(widget, /AppWidgetManager\.getInstance/);
  assert.match(widget, /updateAppWidgetState/);
  assert.match(widget, /widget\.update\(applicationContext, glanceId\)/);
  assert.match(nativeModule, /refreshGatherMindWidgets\(context\)/);
  assert.match(widget, /gathermind:\/\/goal/);
  assert.match(widget, /gathermind:\/\/appointment/);
});
