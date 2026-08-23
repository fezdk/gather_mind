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

const { editorDraftHasChanges } = require('../src/editor-changes.ts');
const appSource = fs.readFileSync(require.resolve('../App.tsx'), 'utf8');

test('unchanged or absent editor drafts close without a warning', () => {
  const thought = { kind: 'thought', itemId: 'thought-1', text: 'Call doctor', tags: 'health, admin', appointmentId: '' };
  assert.equal(editorDraftHasChanges(null, thought), false);
  assert.equal(editorDraftHasChanges(thought, thought), false);
  assert.equal(editorDraftHasChanges({ ...thought, text: '  Call doctor  ', tags: ' health, admin, health ' }, thought), false);
});

test('material changes in every saved form require confirmation', () => {
  const thought = { kind: 'thought', itemId: null, text: '', tags: '', appointmentId: '' };
  assert.equal(editorDraftHasChanges({ ...thought, text: 'A thought' }, thought), true);

  const task = { kind: 'task', itemId: 'goal-1', title: 'Medicine', recurrence: 'daily', scheduledFor: '2026-08-23', steps: [] };
  assert.equal(editorDraftHasChanges({ ...task, scheduledFor: '2026-08-24' }, task), true);

  const appointment = { kind: 'appointment', itemId: 'appointment-1', title: 'Doctor', startsAt: '2026-08-24T08:00:00.000Z', location: 'Clinic', reminderMinutes: 60 };
  assert.equal(editorDraftHasChanges({ ...appointment, reminderMinutes: 120 }, appointment), true);

  const agenda = { kind: 'agenda', appointmentId: 'appointment-1', itemId: 'item-1', text: 'Bring notes' };
  assert.equal(editorDraftHasChanges({ ...agenda, text: 'Bring notes and results' }, agenda), true);
});

test('empty unfinished goal steps do not count as unsaved content', () => {
  const baseline = { kind: 'task', itemId: null, title: '', recurrence: 'once', scheduledFor: '2026-08-22', steps: [] };
  const draft = { ...baseline, steps: [{ id: 'empty-step', text: '   ' }] };
  assert.equal(editorDraftHasChanges(draft, baseline), false);
  assert.equal(editorDraftHasChanges({ ...draft, steps: [{ id: 'empty-step', text: 'Open the letter' }] }, baseline), true);
});

test('an auto-saved goal step can advance the baseline without hiding other edits', () => {
  const savedBaseline = { kind: 'task', itemId: 'goal-1', title: 'Prepare', recurrence: 'once', scheduledFor: '2026-08-22', steps: [{ id: 'step-1', text: 'Open letter' }] };
  assert.equal(editorDraftHasChanges({ ...savedBaseline, steps: [{ id: 'step-1', text: ' Open letter ' }] }, savedBaseline), false);
  assert.equal(editorDraftHasChanges({ ...savedBaseline, title: 'Prepare documents' }, savedBaseline), true);
});

test('whitespace-only appointment and plan-item edits do not create false warnings', () => {
  const appointment = { kind: 'appointment', itemId: 'appointment-1', title: 'Doctor', startsAt: '2026-08-24T08:00:00.000Z', location: 'Clinic', reminderMinutes: 60 };
  assert.equal(editorDraftHasChanges({ ...appointment, title: ' Doctor ', location: ' Clinic ' }, appointment), false);

  const agenda = { kind: 'agenda', appointmentId: 'appointment-1', itemId: 'item-1', text: 'Bring notes' };
  assert.equal(editorDraftHasChanges({ ...agenda, text: '  Bring notes  ' }, agenda), false);
});

test('a restored encrypted draft without an in-memory baseline is treated as unsaved', () => {
  const restored = { kind: 'appointment', itemId: null, title: 'Dentist', startsAt: '2026-08-24T08:00:00.000Z', location: '', reminderMinutes: 120 };
  assert.equal(editorDraftHasChanges(restored, null), true);
});

test('native sheet events cannot be interpreted as goal-editor transition callbacks', () => {
  assert.match(appSource, /function closeTaskEditor\(\)\s*\{/);
  assert.match(appSource, /function closeTaskEditorThen\(afterClose: \(\) => void\)/);
  assert.doesNotMatch(appSource, /function closeTaskEditor\(afterClose/);
  assert.match(appSource, /function requestEditorClose\(kind: EditorDraft\['kind'\], close: \(\) => void\)/);
  assert.doesNotMatch(appSource, /function requestEditorClose\([^)]*afterClose/);
  assert.doesNotMatch(appSource, /onRequestClose=\{onClose\}/);
  assert.doesNotMatch(appSource, /onAccessibilityEscape=\{onClose\}/);
  assert.doesNotMatch(appSource, /style=\{s\.close\} onPress=\{onClose\}/);
});
