const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');

test('Settings keeps automatic update checks explicit and manual browser checks independent', () => {
  assert.match(appSource, /<Field heading>App updates<\/Field>/);
  assert.match(appSource, /Automatic checks are optional and off by default/);
  assert.match(appSource, /Check GitHub for new releases/);
  assert.match(appSource, /at most once every 24 hours when you open or return to the app/);
  assert.match(appSource, /Check manually in browser/);
  assert.match(appSource, /your browser handles the connection to GitHub/);
});

test('update disclosure distinguishes Android Internet access from the app opt-in', () => {
  assert.match(appSource, /Android grants apps general Internet access when they are installed/);
  assert.match(appSource, /does not show a runtime permission prompt/);
  assert.match(appSource, /contacts only .*api\.github\.com/);
  assert.match(appSource, /Thoughts, goals, appointments, health entries, identifiers, and usage data stay on this phone/);
});

test('automatic update lifecycle is foreground-only and closes cleanly', () => {
  assert.match(appSource, /if \(lockStatusRef\.current === 'unlocked'\) void runAutomaticUpdateCheck\(\)/);
  assert.match(appSource, /if \(updateModal\) \{ setUpdateModal\(false\); return true; \}/);
  assert.match(appSource, /setUpdateModal\(false\);\n    setNotice\(null\)/);
});
