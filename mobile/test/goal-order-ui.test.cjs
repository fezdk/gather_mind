const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');

test('Today exposes a dedicated hold-to-drag handle without replacing horizontal goal swipes', () => {
  assert.match(appSource, /function TaskDragHandle/);
  assert.match(appSource, /name="drag-handle"/);
  assert.match(appSource, /setTimeout\(\(\) => \{[\s\S]*callbacksRef\.current\.onDragStart\(\);[\s\S]*\}, 350\)/);
  assert.match(appSource, /onMoveShouldSetPanResponder: \(_event, gesture\) => Math\.abs\(gesture\.dx\) > 9/);
  assert.match(appSource, /scrollEnabled=\{!draggingTaskId\}/);
  assert.match(appSource, /function startAutoScroll\(direction: -1 \| 0 \| 1\)/);
  assert.match(appSource, /scrollRef\.current\?\.scrollTo\(\{ y: nextOffset, animated: false \}\)/);
  assert.match(appSource, /hold the handle to reorder/);
});

test('goal ordering has equivalent TalkBack actions and position feedback', () => {
  assert.match(appSource, /accessibilityRole="adjustable"/);
  assert.match(appSource, /Reorder goal: \$\{task\.title\}/);
  assert.match(appSource, /Position \$\{position \+ 1\} of \$\{taskCount\}/);
  assert.match(appSource, /name: 'decrement' as const, label: 'Move earlier'/);
  assert.match(appSource, /name: 'increment' as const, label: 'Move later'/);
  assert.match(appSource, /moved to position \$\{targetIndex \+ 1\}/);
});
