import {
  STORAGE_KEY,
  buildCloud,
  colorFor,
  createEmptyState,
  describeCountdown,
  makeAgendaText,
  makeId,
  pastAppointments,
  removeLegacySeedData,
  searchThoughts,
  upcomingAppointments
} from './core.js';

const icons = {
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/></svg>',
  location: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 7 1.5 1.5L9 6M11 7h8M5 12l1.5 1.5L9 11m2 1h8M5 17l1.5 1.5L9 16m2 1h8"/></svg>',
  chevron: '<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
};

const state = loadState();
let activeView = 'home';
let appointmentFilter = 'upcoming';
let cloudTag = 'all';
let deferredInstallPrompt = null;
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 1 && Array.isArray(saved.thoughts) && Array.isArray(saved.appointments)) {
      const cleaned = removeLegacySeedData(saved);
      if (cleaned !== saved) localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      return cleaned;
    }
  } catch (error) {
    console.warn('Could not read saved data', error);
  }
  const empty = createEmptyState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
  return empty;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDate(isoDate, options) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(isoDate));
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function go(view, options = {}) {
  activeView = view;
  $$('.view').forEach((section) => section.classList.toggle('is-active', section.dataset.view === view));
  $$('.bottom-nav button').forEach((button) => button.classList.toggle('is-active', button.dataset.go === view || (view === 'appointment-detail' && button.dataset.go === 'appointments')));
  $('.bottom-nav').hidden = view === 'appointment-detail';
  if (view === 'appointment-detail' && options.appointmentId) renderAppointmentDetail(options.appointmentId);
  if (view === 'cloud') renderCloud();
  if (view === 'appointments') renderAppointments();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $(`[data-view="${view}"]`)?.focus({ preventScroll: true });
}

function renderHome() {
  $('#today-label').textContent = formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' });
  const next = upcomingAppointments(state.appointments)[0];
  $('#next-appointment').innerHTML = next ? nextCard(next) : `
    <button class="empty-card" id="empty-add-appointment" type="button">
      <strong>Nothing scheduled</strong>Add an appointment when you’re ready.
    </button>`;
  if (next) $('#next-appointment .next-card').addEventListener('click', () => go('appointment-detail', { appointmentId: next.id }));
  else $('#empty-add-appointment').addEventListener('click', openAppointmentDialog);

  const threads = [...state.thoughts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 4);
  $('#loose-threads').innerHTML = threads.length ? threads.map((thought) => `
    <button class="thread-item" type="button" data-thought-id="${thought.id}">
      <span class="dot" style="background:${colorFor(thought.tags?.[0] || thought.id)}"></span>
      <span class="thread-copy"><strong>${escapeHtml(thought.text)}</strong><small>${escapeHtml(thought.tags?.join(' · ') || 'Unsorted')}</small></span>
      ${icons.chevron}
    </button>`).join('') : '<div class="empty-card"><strong>Your mind is clear</strong>New thoughts will wait here without judgement.</div>';
  $$('.thread-item').forEach((button) => button.addEventListener('click', () => openThoughtDialog(button.dataset.thoughtId)));
}

function nextCard(appointment) {
  const date = new Date(appointment.startsAt);
  const agendaCount = appointment.agenda?.filter((item) => !item.done).length || 0;
  const linkedCount = state.thoughts.filter((thought) => thought.appointmentId === appointment.id).length;
  return `
    <button class="next-card" type="button">
      <span class="next-card-main">
        <span class="date-block"><span>${formatDate(date, { month: 'short' })}</span><strong>${date.getDate()}</strong></span>
        <span class="appointment-summary"><h3>${escapeHtml(appointment.title)}</h3><p>${formatDate(date, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}${appointment.location ? ` · ${escapeHtml(appointment.location)}` : ''}</p></span>
        ${icons.chevron}
      </span>
      <span class="agenda-preview">${icons.list}${agendaCount + linkedCount} ${agendaCount + linkedCount === 1 ? 'item' : 'items'} ready to bring up</span>
    </button>`;
}

function renderCloud() {
  const query = $('#cloud-search').value.trim();
  const allTags = [...new Set(state.thoughts.flatMap((thought) => thought.tags || []))].sort();
  if (cloudTag !== 'all' && !allTags.includes(cloudTag)) cloudTag = 'all';
  $('#filter-chips').innerHTML = ['all', ...allTags].map((tag) => `<button type="button" class="${cloudTag === tag ? 'is-selected' : ''}" data-tag="${escapeHtml(tag)}">${tag === 'all' ? 'All thoughts' : escapeHtml(tag)}</button>`).join('');
  $$('#filter-chips button').forEach((button) => button.addEventListener('click', () => { cloudTag = button.dataset.tag; renderCloud(); }));

  const cloud = buildCloud(state.thoughts, query, cloudTag);
  $('#cloud-count').textContent = `${cloud.nodes.length} ${cloud.nodes.length === 1 ? 'thought' : 'thoughts'}`;
  renderCloudSvg(cloud);
  $('#related-list').innerHTML = cloud.nodes.length ? cloud.nodes.map((thought) => `
    <button class="related-item" type="button" data-thought-id="${thought.id}">
      <span class="related-bubble" style="background:${colorFor(thought.tags?.[0] || thought.id)}"></span>
      <span><strong>${escapeHtml(thought.text)}</strong><small>${escapeHtml(thought.tags?.join(' · ') || 'Unsorted')}</small></span>
      ${icons.chevron}
    </button>`).join('') : '<div class="empty-card"><strong>No matching thoughts</strong>Try another phrase, or catch a new thought.</div>';
  $$('.related-item').forEach((button) => button.addEventListener('click', () => openThoughtDialog(button.dataset.thoughtId)));
}

function renderCloudSvg(cloud) {
  if (!cloud.nodes.length) {
    $('#mind-cloud').innerHTML = '<div class="cloud-empty"><span><strong>Nothing gathered here yet.</strong><br>Try a different phrase.</span></div>';
    return;
  }
  const width = 520;
  const height = 330;
  const centerX = width / 2;
  const centerY = height / 2;
  const positions = new Map();
  cloud.nodes.forEach((node, index) => {
    if (index === 0) positions.set(node.id, { x: centerX, y: centerY, r: 48 });
    else {
      const ring = index <= 6 ? 1 : 2;
      const itemsInRing = ring === 1 ? Math.min(6, cloud.nodes.length - 1) : Math.max(1, cloud.nodes.length - 7);
      const localIndex = ring === 1 ? index - 1 : index - 7;
      const angle = -Math.PI / 2 + (localIndex / itemsInRing) * Math.PI * 2 + (ring === 2 ? .35 : 0);
      const distance = ring === 1 ? 108 : 151;
      positions.set(node.id, { x: centerX + Math.cos(angle) * distance, y: centerY + Math.sin(angle) * distance, r: ring === 1 ? 35 : 29 });
    }
  });
  const edges = cloud.edges.map((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    return `<line class="cloud-edge" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
  }).join('');
  const nodes = cloud.nodes.map((thought, index) => {
    const position = positions.get(thought.id);
    const words = thought.text.split(/\s+/);
    const firstLine = escapeHtml(words.slice(0, 3).join(' '));
    const secondLine = escapeHtml(words.length > 3 ? `${words.slice(3, 6).join(' ')}${words.length > 6 ? '…' : ''}` : '');
    return `<g class="cloud-node" role="button" tabindex="0" aria-label="${escapeHtml(thought.text)}" data-thought-id="${thought.id}">
      <circle cx="${position.x}" cy="${position.y}" r="${position.r}" fill="${colorFor(thought.tags?.[0] || thought.id)}" />
      <text x="${position.x}" y="${position.y - (secondLine ? 3 : 0)}">${firstLine}</text>
      ${secondLine ? `<text class="sub" x="${position.x}" y="${position.y + 12}">${secondLine}</text>` : ''}
    </g>`;
  }).join('');
  $('#mind-cloud').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="group">${edges}${nodes}</svg>`;
  $$('.cloud-node').forEach((node) => {
    const open = () => {
      const thought = state.thoughts.find((item) => item.id === node.dataset.thoughtId);
      $('#cloud-search').value = thought?.tags?.[0] || thought?.text.split(/\s+/).slice(0, 2).join(' ') || '';
      renderCloud();
    };
    node.addEventListener('click', open);
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') open(); });
  });
}

function renderAppointments() {
  const appointments = appointmentFilter === 'upcoming' ? upcomingAppointments(state.appointments) : pastAppointments(state.appointments);
  $('#appointments-list').innerHTML = appointments.length ? appointments.map((appointment) => appointmentListCard(appointment)).join('') : `
    <div class="empty-card"><strong>No ${appointmentFilter} appointments</strong>${appointmentFilter === 'upcoming' ? 'Add one so it does not have to live in your head.' : 'Past appointments will appear here.'}</div>`;
  $$('.appointment-card').forEach((card) => card.addEventListener('click', () => go('appointment-detail', { appointmentId: card.dataset.appointmentId })));
}

function appointmentListCard(appointment) {
  const date = new Date(appointment.startsAt);
  const total = (appointment.agenda?.length || 0) + state.thoughts.filter((thought) => thought.appointmentId === appointment.id).length;
  return `<button class="appointment-card" type="button" data-appointment-id="${appointment.id}">
    <span class="next-card-main">
      <span class="date-block"><span>${formatDate(date, { month: 'short' })}</span><strong>${date.getDate()}</strong></span>
      <span class="appointment-summary"><h3>${escapeHtml(appointment.title)}</h3><p>${formatDate(date, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</p></span>
      ${icons.chevron}
    </span>
    <span class="appointment-meta">
      ${appointment.location ? `<span>${icons.location}${escapeHtml(appointment.location)}</span>` : ''}
      <span>${icons.list}${total} ${total === 1 ? 'item' : 'items'}</span>
    </span>
  </button>`;
}

function renderAppointmentDetail(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment) { go('appointments'); return; }
  const linked = state.thoughts.filter((thought) => thought.appointmentId === appointment.id);
  const date = new Date(appointment.startsAt);
  $('#appointment-detail').innerHTML = `
    <section class="detail-hero">
      <p class="eyebrow">${describeCountdown(appointment.startsAt)}</p>
      <h1 id="detail-title">${escapeHtml(appointment.title)}</h1>
      <div class="detail-facts">
        <span>${icons.calendar}${formatDate(date, { dateStyle: 'full', timeStyle: 'short' })}</span>
        ${appointment.location ? `<span>${icons.location}${escapeHtml(appointment.location)}</span>` : ''}
      </div>
      <span class="countdown">Reminder: ${reminderLabel(appointment.reminderMinutes)}</span>
    </section>

    <section class="detail-section" aria-labelledby="agenda-heading">
      <div class="detail-section-heading">
        <div><h2 id="agenda-heading">Appointment plan</h2><p>Keep questions, decisions, documents, errands, and follow-ups together.</p></div>
        <button class="text-button" id="share-agenda" type="button">Share</button>
      </div>
      <div class="agenda-list">
        ${(appointment.agenda || []).length ? appointment.agenda.map((item) => `
          <div class="agenda-item ${item.done ? 'is-done' : ''}">
            <input type="checkbox" id="agenda-${item.id}" data-agenda-id="${item.id}" ${item.done ? 'checked' : ''} />
            <label for="agenda-${item.id}">${escapeHtml(item.text)}</label>
            <button type="button" data-delete-agenda="${item.id}" aria-label="Remove ${escapeHtml(item.text)}">×</button>
          </div>`).join('') : '<div class="empty-card"><strong>Nothing here yet</strong>Add each question as it occurs to you.</div>'}
      </div>
      <form class="add-agenda-form" id="add-agenda-form">
        <label class="sr-only" for="new-agenda-item">New talking point</label>
        <input id="new-agenda-item" maxlength="180" placeholder="Add a question or symptom…" required />
        <button type="submit">Add</button>
      </form>
    </section>

    <section class="detail-section" aria-labelledby="linked-heading">
      <div class="detail-section-heading">
        <div><h2 id="linked-heading">Related thoughts</h2><p>Thoughts you linked to this visit.</p></div>
        <button class="text-button" id="add-linked-thought" type="button">+ Add</button>
      </div>
      <div>${linked.length ? linked.map((thought) => `<div class="linked-thought">${escapeHtml(thought.text)}</div>`).join('') : '<div class="empty-card">No thoughts linked yet.</div>'}</div>
    </section>

    <div class="detail-actions">
      <button class="secondary-button" id="edit-appointment" type="button">Edit details</button>
      <button class="secondary-button danger-outline" id="delete-appointment" type="button">Delete</button>
    </div>`;

  $$('.agenda-item input').forEach((checkbox) => checkbox.addEventListener('change', () => {
    const item = appointment.agenda.find((agendaItem) => agendaItem.id === checkbox.dataset.agendaId);
    item.done = checkbox.checked;
    saveState();
    renderAppointmentDetail(appointment.id);
  }));
  $$('[data-delete-agenda]').forEach((button) => button.addEventListener('click', () => {
    appointment.agenda = appointment.agenda.filter((item) => item.id !== button.dataset.deleteAgenda);
    saveState();
    renderAppointmentDetail(appointment.id);
  }));
  $('#add-agenda-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#new-agenda-item');
    appointment.agenda.push({ id: makeId('agenda'), text: input.value.trim(), done: false });
    saveState();
    renderAppointmentDetail(appointment.id);
    showToast('Talking point added');
  });
  $('#add-linked-thought').addEventListener('click', () => openThoughtDialog(null, appointment.id));
  $('#share-agenda').addEventListener('click', () => shareAgenda(appointment));
  $('#edit-appointment').addEventListener('click', () => openAppointmentDialog(appointment.id));
  $('#delete-appointment').addEventListener('click', () => {
    if (!confirm(`Delete “${appointment.title}”? Linked thoughts will be kept.`)) return;
    state.appointments = state.appointments.filter((item) => item.id !== appointment.id);
    state.thoughts.forEach((thought) => { if (thought.appointmentId === appointment.id) thought.appointmentId = ''; });
    saveState();
    renderAll();
    go('appointments');
    showToast('Appointment deleted');
  });
}

function reminderLabel(minutes) {
  const value = Number(minutes);
  if (!value) return 'off';
  if (value === 1440) return '1 day before';
  if (value >= 60) return `${value / 60} hours before`;
  return `${value} minutes before`;
}

async function shareAgenda(appointment) {
  const text = makeAgendaText(appointment, state.thoughts);
  try {
    if (navigator.share) await navigator.share({ title: appointment.title, text });
    else {
      await navigator.clipboard.writeText(text);
      showToast('Appointment notes copied');
    }
  } catch (error) {
    if (error.name !== 'AbortError') showToast('Could not share the notes');
  }
}

function populateAppointmentSelect(selected = '') {
  const select = $('#thought-appointment-select');
  select.innerHTML = '<option value="">Not linked</option>' + upcomingAppointments(state.appointments).map((appointment) => `<option value="${appointment.id}" ${appointment.id === selected ? 'selected' : ''}>${escapeHtml(appointment.title)} · ${formatDate(appointment.startsAt, { month: 'short', day: 'numeric' })}</option>`).join('');
}

function openThoughtDialog(thoughtId = null, appointmentId = '') {
  const dialog = $('#thought-dialog');
  const form = $('#thought-form');
  const thought = state.thoughts.find((item) => item.id === thoughtId);
  form.reset();
  form.elements.id.value = thought?.id || '';
  form.elements.text.value = thought?.text || '';
  form.elements.tags.value = thought?.tags?.join(', ') || '';
  populateAppointmentSelect(thought?.appointmentId || appointmentId);
  $('#thought-dialog-title').textContent = thought ? 'Edit this thought' : 'What’s on your mind?';
  $('#delete-thought').style.display = thought ? 'block' : 'none';
  dialog.showModal();
  setTimeout(() => form.elements.text.focus(), 80);
}

function openAppointmentDialog(appointmentId = null) {
  const dialog = $('#appointment-dialog');
  const form = $('#appointment-form');
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  form.reset();
  form.dataset.appointmentId = appointment?.id || '';
  if (appointment) {
    const localDate = new Date(appointment.startsAt);
    form.elements.title.value = appointment.title;
    form.elements.date.value = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    form.elements.time.value = `${String(localDate.getHours()).padStart(2, '0')}:${String(localDate.getMinutes()).padStart(2, '0')}`;
    form.elements.location.value = appointment.location || '';
    form.elements.reminderMinutes.value = String(appointment.reminderMinutes || 0);
  } else {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    form.elements.date.value = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    form.elements.time.value = '10:00';
  }
  dialog.showModal();
  setTimeout(() => form.elements.title.focus(), 80);
}

function renderAll() {
  renderHome();
  renderCloud();
  renderAppointments();
  if (activeView === 'appointment-detail') {
    const visibleId = $('#appointment-detail [data-appointment-id]')?.dataset.appointmentId;
    if (visibleId) renderAppointmentDetail(visibleId);
  }
}

function checkReminders() {
  if (!state.preferences.notifications || Notification.permission !== 'granted') return;
  const now = Date.now();
  state.appointments.forEach((appointment) => {
    if (!appointment.reminderMinutes || appointment.reminderShown) return;
    const triggerTime = Date.parse(appointment.startsAt) - appointment.reminderMinutes * 60_000;
    if (triggerTime <= now && Date.parse(appointment.startsAt) > now) {
      new Notification(appointment.title, { body: `Coming up ${describeCountdown(appointment.startsAt).toLocaleLowerCase()}. Open Gather Mind to review your talking points.`, icon: '/assets/icon.svg' });
      appointment.reminderShown = true;
      saveState();
    }
  });
}

function bindEvents() {
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => go(button.dataset.go)));
  $('#quick-capture').addEventListener('click', () => openThoughtDialog());
  $('#add-thought-cloud').addEventListener('click', () => openThoughtDialog());
  $('#add-appointment').addEventListener('click', () => openAppointmentDialog());
  $('#settings-button').addEventListener('click', () => $('#settings-dialog').showModal());

  $('#cloud-search').addEventListener('input', renderCloud);
  $('#clear-search').addEventListener('click', () => { $('#cloud-search').value = ''; $('#cloud-search').focus(); renderCloud(); });
  $$('[data-appointment-filter]').forEach((button) => button.addEventListener('click', () => {
    appointmentFilter = button.dataset.appointmentFilter;
    $$('[data-appointment-filter]').forEach((item) => item.classList.toggle('is-selected', item === button));
    renderAppointments();
  }));

  $('#thought-form').addEventListener('submit', (event) => {
    if (event.submitter?.value !== 'save') return;
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const id = form.elements.id.value;
    const existing = state.thoughts.find((thought) => thought.id === id);
    const values = {
      text: form.elements.text.value.trim(),
      tags: [...new Set(form.elements.tags.value.split(',').map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))],
      appointmentId: form.elements.appointmentId.value
    };
    if (existing) Object.assign(existing, values);
    else state.thoughts.unshift({ id: makeId('thought'), ...values, createdAt: new Date().toISOString() });
    saveState();
    $('#thought-dialog').close();
    renderAll();
    if (activeView === 'appointment-detail' && values.appointmentId) renderAppointmentDetail(values.appointmentId);
    showToast(existing ? 'Thought updated' : 'Thought safely caught');
  });

  $('#delete-thought').addEventListener('click', () => {
    const id = $('#thought-form').elements.id.value;
    if (!id || !confirm('Delete this thought?')) return;
    state.thoughts = state.thoughts.filter((thought) => thought.id !== id);
    saveState();
    $('#thought-dialog').close();
    renderAll();
    showToast('Thought deleted');
  });

  $('#appointment-form').addEventListener('submit', (event) => {
    if (event.submitter?.value !== 'save') return;
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const startsAt = new Date(`${form.elements.date.value}T${form.elements.time.value}`);
    if (Number.isNaN(startsAt.getTime())) { showToast('Please choose a valid date and time'); return; }
    const existing = state.appointments.find((appointment) => appointment.id === form.dataset.appointmentId);
    const values = {
      title: form.elements.title.value.trim(),
      startsAt: startsAt.toISOString(),
      location: form.elements.location.value.trim(),
      reminderMinutes: Number(form.elements.reminderMinutes.value),
      reminderShown: false
    };
    if (existing) Object.assign(existing, values);
    else state.appointments.push({ id: makeId('appointment'), ...values, createdAt: new Date().toISOString(), agenda: [] });
    saveState();
    $('#appointment-dialog').close();
    renderAll();
    if (existing && activeView === 'appointment-detail') renderAppointmentDetail(existing.id);
    else go('appointments');
    showToast(existing ? 'Appointment updated' : 'Appointment created');
  });

  $('#notification-button').addEventListener('click', async () => {
    if (!('Notification' in window)) { showToast('Notifications are not supported in this browser'); return; }
    const permission = await Notification.requestPermission();
    state.preferences.notifications = permission === 'granted';
    saveState();
    $('#notification-button').textContent = permission === 'granted' ? 'Enabled' : 'Blocked';
    showToast(permission === 'granted' ? 'Gentle reminders enabled' : 'Notifications were not enabled');
    checkReminders();
  });

  $('#delete-data-button').addEventListener('click', () => {
    if (!confirm('Permanently delete every thought and appointment stored by Gather Mind in this browser? This cannot be undone.')) return;
    Object.assign(state, createEmptyState());
    saveState();
    $('#settings-dialog').close();
    renderAll();
    go('home');
    showToast('All local Gather Mind data deleted');
  });

  $('#install-button').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('#install-button').hidden = true;
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('#install-button').hidden = false;
  });
}

function init() {
  bindEvents();
  renderAll();
  if ('Notification' in window && Notification.permission === 'granted') {
    state.preferences.notifications = true;
    $('#notification-button').textContent = 'Enabled';
  }
  checkReminders();
  setInterval(checkReminders, 60_000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Offline mode unavailable', error));
}

init();
