export const STORAGE_KEY = 'gather-mind-state-v1';

const PALETTE = ['#dfe9df', '#f7e1d3', '#efe2ac', '#ded8eb', '#d8e9e9', '#efd5cf'];
const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'before', 'bring', 'but', 'can',
  'could', 'for', 'from', 'have', 'into', 'just', 'need', 'not', 'that', 'the',
  'then', 'there', 'this', 'to', 'want', 'with', 'would', 'you', 'your'
]);

export function makeId(prefix = 'item') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function tokenize(value = '') {
  return [...new Set(
    value
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  )];
}

export function thoughtWords(thought) {
  return tokenize(`${thought.text} ${(thought.tags || []).join(' ')}`);
}

export function relationScore(left, right) {
  if (!left || !right || left.id === right.id) return 0;
  const leftWords = new Set(thoughtWords(left));
  const overlap = thoughtWords(right).filter((word) => leftWords.has(word)).length;
  const sameAppointment = left.appointmentId && left.appointmentId === right.appointmentId ? 3 : 0;
  const sharedTags = (left.tags || []).filter((tag) => (right.tags || []).includes(tag)).length * 2;
  return overlap + sameAppointment + sharedTags;
}

export function searchThoughts(thoughts, query = '', tag = 'all') {
  const queryWords = tokenize(query);
  return thoughts
    .map((thought) => {
      const words = thoughtWords(thought);
      const searchable = `${thought.text} ${(thought.tags || []).join(' ')}`.toLocaleLowerCase();
      const exactBoost = query && searchable.includes(query.toLocaleLowerCase()) ? 4 : 0;
      const wordScore = queryWords.reduce((score, word) => score + (words.some((candidate) => candidate.includes(word)) ? 2 : 0), 0);
      const tagMatch = tag === 'all' || (thought.tags || []).includes(tag);
      return { thought, score: exactBoost + wordScore };
    })
    .filter(({ score, thought }) => (queryWords.length === 0 || score > 0) && (tag === 'all' || thought.tags?.includes(tag)))
    .sort((a, b) => b.score - a.score || Date.parse(b.thought.createdAt) - Date.parse(a.thought.createdAt))
    .map(({ thought }) => thought);
}

export function buildCloud(thoughts, query = '', tag = 'all', limit = 12) {
  const nodes = searchThoughts(thoughts, query, tag).slice(0, limit);
  const edges = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const score = relationScore(nodes[i], nodes[j]);
      if (score > 0) edges.push({ from: nodes[i].id, to: nodes[j].id, score });
    }
  }
  return { nodes, edges: edges.sort((a, b) => b.score - a.score).slice(0, 18) };
}

export function upcomingAppointments(appointments, now = new Date()) {
  return appointments
    .filter((appointment) => Date.parse(appointment.startsAt) >= now.getTime())
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function pastAppointments(appointments, now = new Date()) {
  return appointments
    .filter((appointment) => Date.parse(appointment.startsAt) < now.getTime())
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
}

export function daysUntil(isoDate, now = new Date()) {
  const target = new Date(isoDate);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((startTarget - startToday) / 86_400_000);
}

export function describeCountdown(isoDate, now = new Date()) {
  const days = daysUntil(isoDate, now);
  if (days < 0) return days === -1 ? 'Yesterday' : `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function colorFor(value = '') {
  const number = [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return PALETTE[number % PALETTE.length];
}

export function makeAgendaText(appointment, thoughts = []) {
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(appointment.startsAt));
  const items = (appointment.agenda || []).map((item) => `- ${item.done ? '✓' : '○'} ${item.text}`);
  const linked = thoughts.filter((thought) => thought.appointmentId === appointment.id).map((thought) => `- ${thought.text}`);
  return [
    appointment.title,
    when,
    appointment.location || '',
    '',
    'Appointment plan:',
    ...(items.length ? items : ['- Nothing added yet']),
    ...(linked.length ? ['', 'Related thoughts:', ...linked] : [])
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join('\n');
}

export function createEmptyState() {
  return {
    version: 1,
    thoughts: [],
    appointments: [],
    preferences: { notifications: false }
  };
}

export function removeLegacySeedData(state) {
  const appointmentIds = new Set(['appointment_demo_doctor', 'appointment_demo_dentist']);
  const thoughtIds = new Set(['thought_sleep', 'thought_headaches', 'thought_refill', 'thought_meeting', 'thought_walk']);
  const thoughts = state.thoughts
    .filter((thought) => !thoughtIds.has(thought.id))
    .map((thought) => appointmentIds.has(thought.appointmentId) ? { ...thought, appointmentId: '' } : thought);
  const appointments = state.appointments.filter((appointment) => !appointmentIds.has(appointment.id));
  if (thoughts.length === state.thoughts.length && appointments.length === state.appointments.length && thoughts.every((thought, index) => thought === state.thoughts[index])) return state;
  return { ...state, thoughts, appointments };
}
