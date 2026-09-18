const fs = require('node:fs');
const Module = require('node:module');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
let host;
const hooks = {
  useState(value) { const i = host.index++; const target = host; if (!(i in target.slots)) target.slots[i] = typeof value === 'function' ? value() : value; return [target.slots[i], next => { target.slots[i] = typeof next === 'function' ? next(target.slots[i]) : next; }]; },
  useRef(value) { const i = host.index++; return host.slots[i] ??= { current: value }; },
  useMemo(factory) { return factory(); },
  useEffect() {},
};
let dimensions = { fontScale: 1, width: 390 };
const native = { Platform: { OS: 'android' }, useWindowDimensions: () => dimensions, Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: x => x, absoluteFill: {} } };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'react') return { ...React, ...hooks };
  if (request === 'react-native') return native;
  if (request === '@expo/vector-icons/MaterialIcons') return { __esModule: true, default: 'Icon' };
  if (request === './DateTimePicker') return { __esModule: true, default: 'DatePicker' };
  return originalLoad.call(this, request, parent, isMain);
};
const { GoalHistoryView } = require('../src/GoalHistoryView.tsx');
Module._load = originalLoad;
const { LIGHT_COLORS, DARK_COLORS } = require('../src/theme.ts');
const record = { date: '2026-09-16', goals: [{ id: 'goal', title: 'Morning routine', recurrence: 'daily', completed: true, steps: [{ id: 'step', text: 'Breakfast', completed: false }] }] };
function all(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(all); return [node, ...all(node.props?.children)]; }
function text(node) { if (typeof node === 'string' || typeof node === 'number') return String(node); if (!node) return ''; if (Array.isArray(node)) return node.map(text).join(''); return text(node.props?.children); }
function mount(extra = {}) {
  const instance = { index: 0, slots: [] };
  const props = { history: [record], today: '2026-09-17', colors: LIGHT_COLORS, bottomInset: 24, onBack() {}, ...extra };
  let tree;
  function render() { host = instance; host.index = 0; tree = GoalHistoryView(props); }
  render();
  return {
    get nodes() { return all(tree); }, get tree() { return tree; },
    press(predicate) { const button = all(tree).find(n => n.type === 'Pressable' && predicate(n)); assert.ok(button, 'button exists'); assert.ok(!button.props.disabled, 'button enabled'); button.props.onPress(); render(); },
    update(next) { Object.assign(props, next); render(); },
  };
}

test('defaults to week/yesterday; switching month preserves selection; choosing a day reads its snapshot', () => {
  const ui = mount();
  assert.ok(ui.nodes.find(n => n.props?.accessibilityRole === 'tab' && text(n) === 'Week').props.accessibilityState.selected);
  assert.match(text(ui.tree), /Morning routine/);
  assert.match(text(ui.tree), /0 of 1 steps completed/); // no fake checks after parent completion
  ui.press(n => text(n) === 'Month');
  assert.ok(ui.nodes.find(n => n.props?.accessibilityLabel?.includes('16') && n.props.accessibilityRole === 'button' && n.props.accessibilityState?.selected));
  ui.press(n => n.props.accessibilityLabel?.startsWith('Tuesday') && n.props.accessibilityLabel.includes('15'));
  assert.match(text(ui.tree), /No saved history/);
  assert.doesNotMatch(text(ui.tree), /Morning routine/);
  ui.press(n => text(n) === 'Week');
  assert.ok(ui.nodes.find(n => n.props?.accessibilityState?.selected && n.props.accessibilityLabel?.includes('15')));
});

test('goals/steps are plain status, without edit, checkbox, or mutation controls; Back exits', () => {
  let back = 0;
  const ui = mount({ onBack() { back++; } });
  assert.equal(ui.nodes.some(n => n.props?.accessibilityRole === 'checkbox' || (typeof n.type === 'string' && /TextInput|Switch/.test(n.type))), false);
  const detail = ui.nodes.find(n => n.type === 'View' && n.props.collapsable === false);
  assert.equal(all(detail).some(n => n.type === 'Pressable' || n.props?.onPress || n.props?.onChange), false);
  ui.press(n => n.props.accessibilityLabel === 'Back to Today');
  assert.equal(back, 1);
});

test('future/current dates are disabled, week arrows are bounded and date picker is limited to yesterday', () => {
  const ui = mount();
  assert.equal(ui.nodes.find(n => n.props?.accessibilityLabel === 'Next week').props.disabled, true);
  assert.equal(ui.nodes.find(n => n.props?.accessibilityLabel?.startsWith('Thursday') && n.props.accessibilityLabel.includes('17')).props.disabled, true);
  ui.press(n => n.props.accessibilityLabel === 'Previous week');
  assert.equal(ui.nodes.find(n => n.props?.accessibilityLabel === 'Next week').props.disabled, false);
  ui.press(n => n.props.accessibilityLabel?.endsWith('Choose a date'));
  const picker = ui.nodes.find(n => n.type === 'DatePicker');
  assert.equal(picker.props.maximumDate.getDate(), 16);
  picker.props.onChange({ type: 'set' }, new Date(2026, 8, 20));
  ui.update({});
  assert.equal(ui.nodes.some(n => n.props?.accessibilityState?.selected && n.props.accessibilityLabel?.includes('20 September')), false);
});

test('empty days differ from missing records; dark mode, 200% font and narrow phones use readable date rows', () => {
  dimensions = { width: 360, fontScale: 2 };
  try {
    const ui = mount({ history: [{ date: record.date, goals: [] }], colors: DARK_COLORS });
    assert.match(text(ui.tree), /No goals planned/);
    assert.ok(ui.nodes.find(n => n.type === 'Pressable' && text(n).startsWith('Jump to selected')));
    assert.ok(ui.nodes.find(n => n.type === 'Pressable' && text(n).includes('Wednesday') && text(n).includes('16')));
    ui.press(n => text(n) === 'Month');
    assert.equal(ui.nodes.filter(n => n.type === 'Pressable' && n.props.accessibilityLabel?.includes('No saved history')).length, 15);
  } finally { dimensions = { width: 390, fontScale: 1 }; }
});

test('history is integrated into encrypted saves, foreground/day rollover, back navigation and deletion', () => {
  const app = fs.readFileSync(require.resolve('../App.tsx'), 'utf8');
  assert.match(app, /const hydrated = captureGoalDay\(/);
  assert.match(app, /next = captureGoalDay\(\{ \.\.\.next, goalHistory: stateRef\.current\?\.goalHistory \?\? next\.goalHistory \}\)/);
  assert.match(app, /if \(NativeAppState.currentState === 'active'\) refreshGoalDay\(\)/);
  assert.match(app, /if \(goalHistoryOpen\) \{ setGoalHistoryOpen\(false\); return true; \}/);
  assert.match(app, /goalHistoryOpen \? <GoalHistoryView history=\{state.goalHistory\}/);
  assert.match(app, /onOpenHistory=\{\(\) => \{ refreshGoalDay\(\); setGoalHistoryOpen\(true\); \}\}/);
  assert.match(app, /const empty = createEmptyState\(\);\s*setGoalHistoryOpen\(false\)/);
  assert.match(app, /function lockApp[\s\S]*?setState\(null\);\s*setGoalHistoryOpen\(false\)/);
});
