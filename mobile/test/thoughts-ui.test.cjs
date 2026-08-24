const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const appSource = fs.readFileSync(require.resolve('../App.tsx'), 'utf8');

test('creation actions share one primary style and thought creation precedes search', () => {
  assert.match(appSource, /function CreationButton\(/);
  assert.match(appSource, /<CreationButton label="Goal \+"/);
  assert.match(appSource, /<CreationButton label="Appointment \+"/);
  assert.match(appSource, /<CreationButton label="Thought \+"/);

  const thoughtAction = appSource.indexOf('<CreationButton label="Thought +"');
  const searchField = appSource.indexOf('<View style={s.searchField}>', thoughtAction);
  assert.ok(thoughtAction >= 0 && searchField > thoughtAction, 'Thought creation must remain above search');
  assert.match(appSource.slice(searchField, searchField + 500), /<MaterialIcons name="search"/);
  assert.doesNotMatch(appSource, />\+ Add thought</);
});
