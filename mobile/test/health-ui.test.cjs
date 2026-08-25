const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../app.json'), 'utf8'));

test('Health is an explicit setting with a separate nested cycle opt-in', () => {
  assert.match(appSource, />Health tracking</);
  assert.match(appSource, /healthEnabled && <View style=\{\[s\.securitySetting, s\.healthSubSetting\]\}>/);
  assert.match(appSource, />Cycle tracking</);
  assert.match(appSource, /state\.health\.enabled && <NavButton label="Health"/);
  assert.match(appSource, /!enabled && tab === 'health'/);
  assert.match(appSource, /Turning Health off hides the tab/);
  assert.match(appSource, /Turning cycle tracking off hides only period history/);
});

test('Health UI keeps estimates bounded and provides local deletion and medical cautions', () => {
  assert.match(appSource, /cycleTodayInsight\(state\.health, today\)/);
  assert.match(appSource, /health\.cycleTrackingEnabled && <View style=\{s\.healthCard\}>/);
  assert.match(appSource, /Log a period/);
  assert.match(appSource, /END DATE/);
  assert.match(appSource, /Mood & sleep history/);
  assert.doesNotMatch(appSource, /A quiet record/);
  assert.match(appSource, /Clear health history/);
  assert.match(appSource, /must not be used for contraception/);
  assert.match(appSource, /Health tracking requires no Android health permission/);
});

test('adding Health does not grant Android Internet access', () => {
  assert.ok(appJson.expo.android.blockedPermissions.includes('android.permission.INTERNET'));
  assert.ok(!appJson.expo.android.permissions.includes('android.permission.INTERNET'));
});
