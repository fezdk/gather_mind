const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
};
const { createAndroidPickerLifecycle } = require('../src/android-picker-lifecycle.ts');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function fixture() {
  const listeners = new Set();
  const fragments = new Map();
  const opens = [];
  const events = [];
  const errors = [];
  const dismissals = [];
  const app = {
    currentState: 'active',
    addEventListener(_event, listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    change(state) {
      app.currentState = state;
      for (const listener of [...listeners]) listener(state);
    },
  };
  const native = {
    rejectDismiss: false,
    dismissGate: null,
    async dismiss(mode) {
      dismissals.push(mode);
      if (native.dismissGate) await native.dismissGate;
      if (native.rejectDismiss) throw new Error('Activity has saved its state');
      const fragment = fragments.get(mode);
      fragments.delete(mode);
      // Native dismissal can resolve the previous open promise later.
      if (fragment) queueMicrotask(() => fragment.onChange({ type: 'dismissed' }));
      return !!fragment;
    },
    open(props) {
      // Match the native library: reuse an existing tagged fragment without
      // displaying it again or attaching a new callback, even if it is hidden.
      if (fragments.has(props.mode)) return;
      fragments.set(props.mode, props);
      opens.push(props);
    },
  };
  const controller = createAndroidPickerLifecycle(native, app);
  const originalDate = new Date('2026-09-20T10:30:00Z');
  const props = (mode = 'date') => ({
    mode,
    value: originalDate,
    minimumDate: new Date('2026-09-14T00:00:00Z'),
    onChange: (event, value) => events.push({ event, value }),
    onError: (error) => errors.push(error),
  });
  return { app, native, controller, fragments, opens, events, errors, dismissals, listeners, props, originalDate };
}

test('appointment calendar reopens after background dismissal fails, preserving its date', async () => {
  const f = fixture();
  const first = f.controller.show(f.props());
  await flush();
  assert.equal(f.opens.length, 1);
  f.native.rejectDismiss = true;
  f.app.change('background');
  await flush();
  assert.equal(f.fragments.size, 1, 'simulate the stopped Activity retaining a hidden native fragment');
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].event.type, 'dismissed');
  assert.equal(f.events[0].value, f.originalDate, 'backgrounding does not commit a different date');
  first();

  f.native.rejectDismiss = false;
  f.app.change('active');
  const second = f.controller.show(f.props());
  await flush();
  assert.equal(f.opens.length, 2, 'must create a fresh visible native calendar');
  assert.equal(f.opens[1].value, f.originalDate);
  assert.equal(f.opens[1].minimumDate.getTime(), f.props().minimumDate.getTime());
  const selected = new Date('2026-09-23T10:30:00Z');
  f.opens[1].onChange({ type: 'set' }, selected);
  assert.equal(f.events.at(-1).value, selected);
  assert.equal(f.listeners.size, 0);
  second();
});

test('a stale callback from an old appointment cannot dismiss or edit a new appointment', async () => {
  const f = fixture();
  const closeOld = f.controller.show(f.props());
  await flush();
  const oldNative = f.opens[0];
  closeOld(); // app lock unmounts editor without publishing any date changes
  const closeNew = f.controller.show({ ...f.props(), minimumDate: undefined });
  await flush();
  oldNative.onChange({ type: 'set' }, new Date('2026-10-01T10:30:00Z'));
  oldNative.onChange({ type: 'dismissed' }, f.originalDate);
  assert.equal(f.events.length, 0);
  assert.equal(f.opens.length, 2);
  assert.equal(f.opens[1].minimumDate, undefined, 'historical appointment date bounds remain unrestricted');
  f.opens[1].onChange({ type: 'set' }, f.originalDate);
  assert.equal(f.events.length, 1);
  closeNew();
});

test('switching date to time waits for cleanup and ignores cancelled pending opens', async () => {
  const f = fixture();
  let release;
  f.native.dismissGate = new Promise((resolve) => { release = resolve; });
  const closeDate = f.controller.show(f.props('date'));
  await flush();
  closeDate();
  const closeTime = f.controller.show(f.props('time'));
  await flush();
  assert.equal(f.opens.length, 0);
  release();
  await flush();
  assert.deepEqual(f.opens.map((props) => props.mode), ['time']);
  assert.equal(f.events.length, 0);
  closeTime();
  await flush();
  assert.equal(f.fragments.size, 0);
});

test('backgrounding during cleanup prevents a native open and resets the parent flag once', async () => {
  const f = fixture();
  let release;
  f.native.dismissGate = new Promise((resolve) => { release = resolve; });
  const close = f.controller.show(f.props());
  await flush();
  f.app.change('background');
  release();
  await flush();
  assert.equal(f.opens.length, 0);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].event.type, 'dismissed');
  close();
  assert.equal(f.events.length, 1);
});

test('native failure resets the picker flag and allows a later retry', async () => {
  const f = fixture();
  f.native.rejectDismiss = true;
  f.controller.show(f.props());
  await flush();
  assert.equal(f.errors.length, 1);
  assert.equal(f.events[0].event.type, 'dismissed');
  assert.equal(f.listeners.size, 0);
  f.native.rejectDismiss = false;
  const close = f.controller.show(f.props());
  await flush();
  assert.equal(f.opens.length, 1);
  close();
});

test('date/time/goal/health picker sessions recover across repeated app switches', async () => {
  const f = fixture();
  for (const mode of ['date', 'time', 'date', 'date', 'time']) {
    f.app.change('active');
    const close = f.controller.show(f.props(mode));
    await flush();
    f.app.change('background');
    close();
    await flush();
  }
  assert.equal(f.opens.length, 5);
  assert.equal(f.events.length, 5);
  assert.ok(f.events.every(({ event }) => event.type === 'dismissed'));
  assert.equal(f.fragments.size, 0);
  assert.equal(f.listeners.size, 0);
});
