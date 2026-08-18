import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCloud,
  createEmptyState,
  daysUntil,
  makeAgendaText,
  relationScore,
  removeLegacySeedData,
  searchThoughts,
  tokenize,
  upcomingAppointments
} from '../src/core.js';

test('tokenize normalizes text and removes filler words', () => {
  assert.deepEqual(tokenize('Bring up the headaches, headaches & SLEEP!'), ['headaches', 'sleep']);
});

test('new browser installations start empty', () => {
  assert.deepEqual(createEmptyState(), {
    version: 1,
    thoughts: [],
    appointments: [],
    preferences: { notifications: false }
  });
});

test('browser upgrades remove only pre-release seed records', () => {
  const state = createEmptyState();
  state.appointments.push({ id: 'appointment_demo_doctor' });
  state.thoughts.push(
    { id: 'thought_sleep', appointmentId: 'appointment_demo_doctor' },
    { id: 'mine', appointmentId: 'appointment_demo_doctor' }
  );
  assert.deepEqual(removeLegacySeedData(state).thoughts, [{ id: 'mine', appointmentId: '' }]);
});

test('search finds thoughts through both body text and tags', () => {
  const thoughts = [
    { id: '1', text: 'Feeling foggy in the morning', tags: ['sleep'], createdAt: '2026-01-01T10:00:00Z' },
    { id: '2', text: 'Renew prescription', tags: ['health'], createdAt: '2026-01-01T09:00:00Z' }
  ];
  assert.equal(searchThoughts(thoughts, 'sleep')[0].id, '1');
  assert.equal(searchThoughts(thoughts, 'prescription')[0].id, '2');
  assert.equal(searchThoughts(thoughts, '', 'health')[0].id, '2');
});

test('related thoughts score shared themes and appointments', () => {
  const left = { id: '1', text: 'Sleep was difficult', tags: ['health'], appointmentId: 'doctor' };
  const right = { id: '2', text: 'Ask doctor about sleep', tags: ['health'], appointmentId: 'doctor' };
  assert.ok(relationScore(left, right) >= 6);
});

test('buildCloud emits a connection for related nodes', () => {
  const thoughts = [
    { id: '1', text: 'Prepare the project agenda', tags: ['meeting'], appointmentId: 'team', createdAt: '2026-08-18T09:00:00Z' },
    { id: '2', text: 'Bring the project notes', tags: ['meeting'], appointmentId: 'team', createdAt: '2026-08-18T08:00:00Z' },
    { id: '3', text: 'Confirm the project deadline', tags: ['work'], appointmentId: '', createdAt: '2026-08-18T07:00:00Z' }
  ];
  const cloud = buildCloud(thoughts, 'project');
  assert.equal(cloud.nodes.length, 3);
  assert.ok(cloud.edges.length >= 1);
});

test('appointments sort from soonest to latest', () => {
  const now = new Date('2026-08-18T09:00:00Z');
  const appointments = [
    { id: 'later', startsAt: '2026-08-20T09:00:00Z' },
    { id: 'soon', startsAt: '2026-08-19T09:00:00Z' },
    { id: 'past', startsAt: '2026-08-17T09:00:00Z' }
  ];
  assert.deepEqual(upcomingAppointments(appointments, now).map((item) => item.id), ['soon', 'later']);
  assert.equal(daysUntil('2026-08-19T09:00:00Z', now), 1);
});

test('agenda export includes talking points and linked thoughts', () => {
  const appointment = { id: 'doctor', title: 'Doctor', startsAt: '2026-08-20T09:00:00Z', agenda: [{ text: 'Ask about sleep', done: false }] };
  const text = makeAgendaText(appointment, [{ appointmentId: 'doctor', text: 'Headaches after work' }]);
  assert.match(text, /Ask about sleep/);
  assert.match(text, /Headaches after work/);
});
