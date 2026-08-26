const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');

test('bottom navigation remains available on appointment detail and leaves detail when used', () => {
  assert.match(appSource, /function navigateToTab\(nextTab: Tab\) \{\s*setSelectedId\(null\);\s*setTab\(nextTab\);\s*\}/);
  assert.match(appSource, /\{selected \? <AppointmentDetail[\s\S]*<\/>\}\s*<View style=\{\[s\.nav/);
  assert.match(appSource, /paddingBottom: 112 \+ bottom/);
  assert.match(appSource, /backLabel=\{tab === 'today' \? 'Today' : 'Appointments'\}/);
});

test('every active tab uses the same icon highlight and Health also becomes filled', () => {
  assert.match(appSource, /style=\{\[s\.navIconState, active && s\.navIconStateActive\]\}/);
  assert.match(appSource, /navIconStateActive: \{ backgroundColor: C\.sagePale \}/);
  assert.match(appSource, /name=\{active \? "favorite" : "favorite-border"\}/);
  assert.match(appSource, /accessibilityRole="tab" accessibilityState=\{\{ selected: active \}\}/);
});
