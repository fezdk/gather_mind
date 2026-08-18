import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { WebSocket } = require('undici');

const pages = await fetch('http://127.0.0.1:9223/json/list').then((response) => response.json());
const page = pages.find((candidate) => candidate.type === 'page' && candidate.url.startsWith('http://127.0.0.1:4173'));
assert.ok(page, 'Gather Mind browser tab was not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const runtimeErrors = [];
let messageId = 0;

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function command(method, params = {}) {
  const id = ++messageId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

await command('Runtime.enable');
await evaluate(`Promise.all([
  navigator.serviceWorker.getRegistrations().then((items) => Promise.all(items.map((item) => item.unregister()))),
  caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
]).then(() => { localStorage.removeItem('gather-mind-state-v1'); location.reload(); })`);
await new Promise((resolve) => setTimeout(resolve, 500));

assert.equal(await evaluate(`document.title`), 'Gather Mind');
assert.equal(await evaluate(`document.querySelector('[data-view="home"]').classList.contains('is-active')`), true);
assert.deepEqual(await evaluate(`JSON.parse(localStorage.getItem('gather-mind-state-v1'))`), {
  version: 1,
  thoughts: [],
  appointments: [],
  preferences: { notifications: false }
});

await evaluate(`(() => {
  const entries = [
    ['Prepare the project agenda', 'meeting, project'],
    ['Bring the project notes', 'meeting, project'],
    ['Confirm the project deadline', 'work, project']
  ];
  for (const [text, tags] of entries) {
    document.querySelector('#quick-capture').click();
    const form = document.querySelector('#thought-form');
    form.elements.text.value = text;
    form.elements.tags.value = tags;
    form.requestSubmit();
  }
})()`);

await evaluate(`document.querySelector('[data-go="cloud"]').click()`);
assert.equal(await evaluate(`document.querySelector('[data-view="cloud"]').classList.contains('is-active')`), true);
assert.ok(await evaluate(`document.querySelectorAll('.cloud-node').length`) >= 3);

await evaluate(`(() => {
  const search = document.querySelector('#cloud-search');
  search.value = 'project';
  search.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
assert.ok(await evaluate(`document.querySelectorAll('.related-item').length`) >= 1);

await evaluate(`(() => {
  document.querySelector('[data-go="home"]').click();
  document.querySelector('#quick-capture').click();
  const form = document.querySelector('#thought-form');
  form.elements.text.value = 'Remember to bring the budget notes';
  form.elements.tags.value = 'work, meeting';
  form.querySelector('.primary-button').click();
})()`);
assert.equal(await evaluate(`JSON.parse(localStorage.getItem('gather-mind-state-v1')).thoughts.some((item) => item.text.includes('budget notes'))`), true);

await evaluate(`(() => {
  document.querySelector('[data-go="appointments"]').click();
  document.querySelector('#add-appointment').click();
  const form = document.querySelector('#appointment-form');
  form.elements.title.value = 'Project review';
  form.elements.date.value = '2027-02-20';
  form.elements.time.value = '11:15';
  form.elements.location.value = 'Video call';
  form.querySelector('.primary-button').click();
})()`);
assert.equal(await evaluate(`JSON.parse(localStorage.getItem('gather-mind-state-v1')).appointments.some((item) => item.title === 'Project review')`), true);

await evaluate(`(() => {
  [...document.querySelectorAll('.appointment-card')].find((card) => card.textContent.includes('Project review')).click();
  const input = document.querySelector('#new-agenda-item');
  input.value = 'Confirm next steps';
  document.querySelector('#add-agenda-form').requestSubmit();
})()`);
assert.equal(await evaluate(`document.querySelector('#appointment-detail').textContent.includes('Confirm next steps')`), true);

const result = {
  views: await evaluate(`document.querySelectorAll('.view').length`),
  thoughts: await evaluate(`JSON.parse(localStorage.getItem('gather-mind-state-v1')).thoughts.length`),
  appointments: await evaluate(`JSON.parse(localStorage.getItem('gather-mind-state-v1')).appointments.length`),
  agendaItems: await evaluate(`document.querySelectorAll('.agenda-item').length`)
};

await evaluate(`navigator.serviceWorker.ready.then(() => true)`);
await command('Network.enable');
await command('Page.reload');
await new Promise((resolve) => setTimeout(resolve, 500));
assert.equal(await evaluate(`Boolean(navigator.serviceWorker.controller)`), true);
await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await command('Page.reload');
await new Promise((resolve) => setTimeout(resolve, 700));
assert.equal(await evaluate(`document.title`), 'Gather Mind');
await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
assert.deepEqual(runtimeErrors, []);

console.log(`Browser smoke test passed: ${JSON.stringify(result)}`);
socket.close();
