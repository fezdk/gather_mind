const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const appSource = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');

test('Appointments exposes an accessible upcoming and past calendar that survives detail navigation', () => {
  assert.match(appSource, /type AppointmentListMode = 'upcoming' \| 'past'/);
  assert.match(appSource, /mode=\{appointmentListMode\} onModeChange=\{setAppointmentListMode\}/);
  assert.match(appSource, /groupPastAppointments\(appointments\)/);
  assert.match(appSource, /Past appointments, \$\{pastCount\}/);
  assert.match(appSource, /accessibilityState=\{\{ selected: mode === 'past' \}\}/);
  assert.match(appSource, /Past appointments stay available to review or edit/);
  assert.match(appSource, /linkedCount=\{linkedCounts\.get\(appointment\.id\) \?\? 0\}/);
  assert.match(appSource, /appointmentIsPast \? 'Past' : appointment\.notificationId/);
});

test('existing historical appointments can be corrected and keep reminders off', () => {
  assert.match(appSource, /if \(!input\.existing && appointmentIsPast\)/);
  assert.match(appSource, /reminderMinutes: appointmentIsPast \? 0 : input\.reminderMinutes/);
  assert.match(appSource, /minimumDate=\{picker === 'date' && !appointment \? new Date\(\) : undefined\}/);
  assert.match(appSource, /Saving keeps it in your history with reminders off/);
});
