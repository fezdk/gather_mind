const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
}

// A small hook host executes the production wrapper's effects and cleanup;
// native dialogs and AppState are the test boundary, not a duplicate wrapper.
let host;
const hooks = {
  useRef(value) {
    const index = host.index++;
    return host.slots[index] ??= { current: value };
  },
  useEffect(effect, deps) {
    const index = host.index++;
    const old = host.slots[index];
    if (old && deps.every((value, i) => Object.is(value, old.deps[i]))) return;
    host.pending.push(() => { old?.cleanup?.(); host.slots[index] = { deps, cleanup: effect() }; });
  },
};
const listeners = new Set();
const app = {
  currentState: 'active',
  addEventListener(_, callback) { listeners.add(callback); return { remove: () => listeners.delete(callback) }; },
  change(state) { app.currentState = state; for (const listener of [...listeners]) listener(state); },
};
const calls = [];
const native = { open: (props) => calls.push(props), dismiss: async () => false };
const platform = { OS: 'android' };
const iosPicker = () => null;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'react') return { ...React, ...hooks };
  if (request === 'react-native') return { AppState: app, Platform: platform };
  if (request === '@react-native-community/datetimepicker') return { __esModule: true, default: iosPicker, DateTimePickerAndroid: native };
  return originalLoad.call(this, request, parent, isMain);
};
const Picker = require('../src/DateTimePicker.tsx').default;
Module._load = originalLoad;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function mount(props) {
  const state = { index: 0, slots: [], pending: [] };
  const render = (next) => {
    host = state;
    state.index = 0;
    const element = Picker(next);
    element.type(element.props);
    for (const effect of state.pending.splice(0)) effect();
  };
  render(props);
  return { render, unmount: () => { for (const slot of state.slots) slot.cleanup?.(); } };
}

test('rerendering an appointment keeps one dialog and publishes through the latest draft callback', async () => {
  calls.length = 0;
  const oldDraft = [];
  const latestDraft = [];
  const props = { value: new Date('2026-09-20T10:30:00Z'), mode: 'date', onChange: (...args) => oldDraft.push(args) };
  const picker = mount(props);
  await flush();
  picker.render({ ...props, onChange: (...args) => latestDraft.push(args) });
  await flush();
  assert.equal(calls.length, 1);
  const chosen = new Date('2026-09-21T10:30:00Z');
  calls[0].onChange({ type: 'set' }, chosen);
  assert.equal(oldDraft.length, 0);
  assert.equal(latestDraft[0][1], chosen);
  picker.unmount();
});

test('background closes the wrapper session and remount can open the unchanged date again', async () => {
  calls.length = 0;
  const events = [];
  const props = { value: new Date('2026-09-20T10:30:00Z'), mode: 'date', onChange: (event) => events.push(event.type) };
  const picker = mount(props);
  await flush();
  app.change('background');
  picker.unmount();
  await flush();
  app.change('active');
  const reopened = mount(props);
  await flush();
  assert.equal(calls.length, 2);
  assert.deepEqual(events, ['dismissed']);
  reopened.unmount();
  await flush();
  assert.equal(listeners.size, 0);
});

test('iOS keeps its existing inline native picker', () => {
  platform.OS = 'ios';
  try {
    const value = new Date();
    const element = Picker({ value, mode: 'date', display: 'spinner' });
    assert.equal(element.type, iosPicker);
    assert.equal(element.props.value, value);
    assert.equal(element.props.display, 'spinner');
  } finally { platform.OS = 'android'; }
});
