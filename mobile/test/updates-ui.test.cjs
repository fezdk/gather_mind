const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');

const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
const modalSource = appSource.slice(appSource.indexOf('function UpdateSettingsModal('), appSource.indexOf('function PrivacyModal('));
const privacySource = appSource.slice(appSource.indexOf('function PrivacyModal('), appSource.indexOf('function PrivacyModal(') + 8500);

function evaluate(source, bindings) {
  const context = { require, exports: {}, ...bindings };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}

const { render } = evaluate(`${modalSource}\nexports.render = UpdateSettingsModal;`, {
  useAppTheme: () => ({ C: {}, s: {} }), APP_VERSION: '0.6.3',
  isReleaseNewer: (version, current) => version !== current,
  updateCheckTime: { format: () => 'Yesterday' },
  Sheet: 'Sheet', Text: 'Text', View: 'View', Field: 'Field', Primary: 'Primary',
  Switch: 'Switch', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator',
});
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  return [node.props?.label, text(node.props?.children)].filter(Boolean).join(' ');
}
const defaults = { visible: true, enabled: false, busy: false, lastCheckedAt: null,
  latestRelease: null, error: null, otaCandidate: null, otaStatus: null, otaBusy: false, otaReady: false };

test('Settings keeps automatic update checks explicit and manual browser checks independent', () => {
  assert.match(appSource, /<Field heading>App updates<\/Field>/);
  assert.match(modalSource, /Tell me about new versions/);
  assert.match(modalSource, /Check GitHub once a day when you use the app. No automatic downloads/);
  let browser = 0, privacy = 0;
  const tree = render({ ...defaults, onCheckInBrowser() { browser++; }, onPrivacy() { privacy++; } });
  nodes(tree).find(n => n.type === 'Pressable' && text(n) === 'Check in browser').props.onPress();
  nodes(tree).find(n => n.type === 'Pressable' && text(n) === 'Privacy details').props.onPress();
  assert.equal(browser, 1);
  assert.equal(privacy, 1);
  assert.equal(nodes(tree).find(n => n.type === 'Switch').props.value, false);
  assert.ok(text(tree).trim().split(/\s+/).length < 80, 'initial settings copy stays short');
  assert.doesNotMatch(text(tree), /CDN|APK|runtime|api\.github|Cloudflare|signature/);
});

test('update disclosure distinguishes Android Internet access from the app opt-in', () => {
  assert.match(privacySource, /Android grants this at installation without a runtime prompt/);
  assert.match(privacySource, /Automatic checks are off by default/);
  assert.match(privacySource, /GitHub’s public release API/);
  assert.match(privacySource, /gathermind\.control\.dk via Cloudflare/);
  assert.match(privacySource, /release-assets\.githubusercontent\.com/);
  assert.match(privacySource, /no personal content, installation identifier, error text, or usage history/);
  assert.match(appSource, /onPrivacy=\{\(\) => \{ setUpdateModal\(false\); setPrivacyModal\(true\); \}\}/);
});

test('one primary action follows check, install and restart states; busy actions stay disabled', () => {
  let found = 0, installed = 0, restarted = 0;
  const actions = { onFindOta() { found++; }, onInstallOta() { installed++; }, onRestartOta() { restarted++; } };
  for (const [extra, label] of [
    [{}, 'Find updates'],
    [{ otaCandidate: { version: '0.6.4' } }, 'Install version 0.6.4'],
    [{ otaCandidate: { version: '0.6.4' }, otaReady: true }, 'Restart with update'],
  ]) {
    const tree = render({ ...defaults, ...actions, ...extra });
    const primary = nodes(tree).filter(n => n.type === 'Primary');
    assert.equal(primary.length, 1);
    assert.equal(primary[0].props.label, label);
    primary[0].props.onPress();
    const busy = render({ ...defaults, ...actions, ...extra, otaBusy: true });
    assert.equal(nodes(busy).find(n => n.type === 'Primary').props.disabled, true);
    if (label.startsWith('Install')) assert.match(text(tree), /saves your work and restarts the app/);
  }
  assert.deepEqual([found, installed, restarted], [1, 1, 1]);
});

test('short check confirmation still requires an explicit choice before networking', () => {
  let dialog, checks = 0;
  const consent = appSource.slice(appSource.indexOf('  function requestOtaCheck()'), appSource.indexOf('  async function restartForOta()'));
  const { request } = evaluate(`${consent}\nexports.request = requestOtaCheck;`, {
    Alert: { alert(...args) { dialog = args; } }, checkOta() { checks++; },
  });
  request();
  assert.equal(checks, 0);
  assert.match(dialog[1], /internet/);
  assert.match(dialog[1], /Nothing downloads until you choose Install/);
  assert.ok(dialog[1].split(/\s+/).length < 30);
  assert.equal(dialog[2][0].style, 'cancel');
  assert.equal(dialog[2][0].onPress, undefined);
  dialog[2][1].onPress();
  assert.equal(checks, 1);
});

test('automatic status and errors appear only with opt-in; newer releases keep the browser route', () => {
  assert.doesNotMatch(text(render({ ...defaults, lastCheckedAt: 1 })), /Last attempted/);
  const error = render({ ...defaults, enabled: true, lastCheckedAt: 1, error: 'Could not check for updates.' });
  assert.match(text(error), /Could not check for updates/);
  assert.match(text(error), /Last attempted\s+Yesterday/);
  assert.ok(nodes(error).find(n => n.props?.accessibilityLiveRegion === 'polite'));
  const release = { version: '0.6.4' };
  let opened;
  const newer = render({ ...defaults, latestRelease: release, onOpenRelease(value) { opened = value; } });
  nodes(newer).find(n => n.type === 'Pressable' && text(n).includes('View version 0.6.4')).props.onPress();
  assert.equal(opened, release);
  assert.match(appSource, /eyebrow=\{`Gather Mind \$\{APP_VERSION\}`\}/);
});

test('automatic update lifecycle is foreground-only and closes cleanly', () => {
  assert.match(appSource, /if \(lockStatusRef\.current === 'unlocked'\) void runAutomaticUpdateCheck\(\)/);
  assert.match(appSource, /if \(updateModal\) \{ setUpdateModal\(false\); return true; \}/);
  assert.match(appSource, /setUpdateModal\(false\);\n    setNotice\(null\)/);
});
