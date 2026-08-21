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

const {
  authenticationCanComplete,
  awayDurationRequiresLock,
  clearPrivateNotifications,
  removePrivateReminder,
  runAfterReminderCancellation,
  settingChangeStayedForeground,
} = require('../src/privacy-operations.ts');

const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;

test('native configuration requires SQLCipher and local secure authentication', () => {
  const sqlitePlugin = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-sqlite');
  const biometricPlugin = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-local-authentication');

  assert.equal(sqlitePlugin?.[1]?.useSQLCipher, true);
  assert.match(biometricPlugin?.[1]?.faceIDPermission ?? '', /unlock your private local data/i);
  assert.ok(app.plugins.includes('expo-secure-store'));
});

test('local-only Android privacy constraints remain enabled', () => {
  assert.equal(app.android.package, 'dk.fez.gathermind');
  assert.equal(app.android.allowBackup, false);
  assert.equal(app.android.softwareKeyboardLayoutMode, 'resize');
  assert.equal(app.userInterfaceStyle, 'automatic');
  assert.ok(app.android.blockedPermissions.includes('android.permission.INTERNET'));
});

test('secure-device fallback may return from background and complete only when active', () => {
  const base = {
    authenticated: true,
    attemptId: 4,
    currentAttemptId: 4,
    generation: 2,
    currentGeneration: 2,
    mounted: true,
    sawBackground: true,
  };
  assert.equal(authenticationCanComplete({ ...base, appState: 'background' }), false);
  assert.equal(authenticationCanComplete({ ...base, appState: 'active' }), true);
  assert.equal(authenticationCanComplete({ ...base, appState: 'active', currentAttemptId: 5 }), false);
});

test('notification privacy cleanup cancels, then dismisses, then clears the response', async () => {
  const calls = [];
  const errors = await clearPrivateNotifications({
    cancelScheduled: async () => { calls.push('cancel'); },
    dismissDelivered: async () => { calls.push('dismiss'); throw new Error('dismiss failed'); },
    clearLastResponse: () => { calls.push('clear-response'); },
  });
  assert.deepEqual(calls, ['cancel', 'dismiss', 'clear-response']);
  assert.equal(errors.length, 1);
});

test('failed reminder cancellation prevents replacement or deletion', async () => {
  let changed = false;
  await assert.rejects(
    runAfterReminderCancellation(
      'private-reminder',
      async () => { throw new Error('cancel failed'); },
      () => { changed = true; },
    ),
    /cancel failed/,
  );
  assert.equal(changed, false);
});

test('an app leave during the setting write forces the authenticated flow to lock', () => {
  assert.equal(settingChangeStayedForeground('active', 7, 7), true);
  assert.equal(settingChangeStayedForeground('background', 7, 8), false);
  assert.equal(settingChangeStayedForeground('active', 7, 8), false);
});

test('the app lock waits for the configured time away', () => {
  const backgroundedAt = 10_000;
  assert.equal(awayDurationRequiresLock(backgroundedAt, backgroundedAt + 59_999, 60_000), false);
  assert.equal(awayDurationRequiresLock(backgroundedAt, backgroundedAt + 60_000, 60_000), true);
  assert.equal(awayDurationRequiresLock(backgroundedAt, backgroundedAt, 0), true);
});

test('individual reminder cleanup attempts scheduled and delivered removal', async () => {
  const calls = [];
  await assert.rejects(removePrivateReminder({
    cancelScheduled: async () => { calls.push('cancel'); throw new Error('cancel failed'); },
    dismissDelivered: async () => { calls.push('dismiss'); },
  }), /cancel failed/);
  assert.deepEqual(calls, ['cancel', 'dismiss']);
});
