export type AgendaItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Thought = {
  id: string;
  text: string;
  tags: string[];
  appointmentId: string;
  createdAt: string;
};

export type Appointment = {
  id: string;
  title: string;
  startsAt: string;
  location: string;
  reminderMinutes: number;
  notificationId: string | null;
  createdAt: string;
  agenda: AgendaItem[];
};

export type TaskRecurrence = 'once' | 'daily' | 'weekly' | 'monthly';

export type DailyTask = {
  id: string;
  title: string;
  scheduledFor: string;
  completedOn: string | null;
  recurrence: TaskRecurrence;
  recurrenceAnchor: string;
  offsetCount: number;
  createdAt: string;
  sourceThoughtId?: string;
  completedOccurrence?: {
    scheduledFor: string;
    offsetCount: number;
  };
};

export type EditorDraft =
  | { kind: 'thought'; itemId: string | null; text: string; tags: string; appointmentId: string }
  | { kind: 'task'; itemId: string | null; title: string; recurrence: TaskRecurrence; scheduledFor?: string }
  | { kind: 'appointment'; itemId: string | null; title: string; startsAt: string; location: string; reminderMinutes: number }
  | { kind: 'agenda'; appointmentId: string; itemId: string | null; text: string };

export type AppState = {
  version: 3;
  thoughts: Thought[];
  appointments: Appointment[];
  tasks: DailyTask[];
};

export const REMINDER_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 1440, label: '1 day' },
] as const;

export function createEmptyState(): AppState {
  return { version: 3, thoughts: [], appointments: [], tasks: [] };
}

export function createGoalFromThought(thought: Thought, today = localDateKey(), now = new Date()): DailyTask {
  return {
    id: makeId('task'),
    title: thought.text.trim(),
    scheduledFor: today,
    completedOn: null,
    recurrence: 'once',
    recurrenceAnchor: today,
    offsetCount: 0,
    createdAt: now.toISOString(),
    sourceThoughtId: thought.id,
  };
}

export function createTask(title: string, recurrence: TaskRecurrence, firstOccurrence = localDateKey(), now = new Date()): DailyTask {
  const today = localDateKey(now);
  const scheduledRecurrence = recurrence !== 'once';
  const scheduledFor = scheduledRecurrence && isLocalDateKey(firstOccurrence) && firstOccurrence >= today ? firstOccurrence : today;
  return {
    id: makeId('task'),
    title,
    scheduledFor,
    completedOn: null,
    recurrence,
    recurrenceAnchor: scheduledFor,
    offsetCount: 0,
    createdAt: now.toISOString(),
  };
}

export function removeLegacySeedData(state: AppState): AppState {
  const appointmentIds = new Set(['appointment_demo_doctor']);
  const thoughtIds = new Set(['thought_sleep', 'thought_headaches', 'thought_refill', 'thought_walk']);
  const taskIds = new Set(['task_medication', 'task_notes', 'task_pharmacy', 'task_water']);
  const thoughts = state.thoughts
    .filter((thought) => !thoughtIds.has(thought.id))
    .map((thought) => appointmentIds.has(thought.appointmentId) ? { ...thought, appointmentId: '' } : thought);
  const appointments = state.appointments.filter((appointment) => !appointmentIds.has(appointment.id));
  const tasks = state.tasks.filter((task) => !taskIds.has(task.id));
  if (thoughts.length === state.thoughts.length && appointments.length === state.appointments.length && tasks.length === state.tasks.length && thoughts.every((thought, index) => thought === state.thoughts[index])) return state;
  return { ...state, thoughts, appointments, tasks };
}

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'before', 'bring', 'but', 'for', 'from', 'have', 'into', 'just', 'need', 'not', 'that', 'the', 'then', 'there', 'this', 'want', 'with', 'your',
  'den', 'der', 'det', 'har', 'ikke', 'jeg', 'kan', 'med', 'min', 'mit', 'mine', 'skal', 'som', 'til', 'var', 'ved', 'vil', 'vores',
]);

export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function tokenize(value = '') {
  return [...new Set(searchTokens(value).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

export function searchThoughts(thoughts: Thought[], query: string) {
  const normalizedQuery = normalizeSearchText(query).trim();
  if (!normalizedQuery) return [...thoughts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const wanted = searchTokens(normalizedQuery);
  return thoughts
    .map((thought) => {
      const searchable = normalizeSearchText(`${thought.text} ${thought.tags.join(' ')}`);
      const words = searchTokens(searchable);
      const score = (searchable.includes(normalizedQuery) ? 4 : 0)
        + wanted.reduce((total, word) => total + (words.some((candidate) => candidate.includes(word)) ? 2 : 0), 0);
      return { thought, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ thought }) => thought);
}

export type ThoughtRelation = {
  thought: Thought;
  sharedTags: string[];
  sharedWords: string[];
  sharesAppointment: boolean;
  score: number;
};

export function relatedThoughts(thoughts: Thought[], focusId: string, limit = 6): ThoughtRelation[] {
  const focus = thoughts.find((thought) => thought.id === focusId);
  if (!focus) return [];
  const focusTags = new Map(focus.tags.map((tag) => [normalizeSearchText(tag.trim()), tag.trim()]));
  const focusWords = new Set(tokenize(focus.text));

  return thoughts
    .filter((thought) => thought.id !== focus.id)
    .map((thought) => {
      const thoughtTags = new Set(thought.tags.map((tag) => normalizeSearchText(tag.trim())));
      const thoughtWords = new Set(tokenize(thought.text));
      const sharedTags = [...focusTags.entries()].filter(([key]) => key && thoughtTags.has(key)).map(([, tag]) => tag);
      const sharedWords = [...focusWords].filter((word) => thoughtWords.has(word));
      const sharesAppointment = !!focus.appointmentId && focus.appointmentId === thought.appointmentId;
      const score = sharedTags.length * 5 + sharedWords.length * 2 + Number(sharesAppointment) * 4;
      return { thought, sharedTags, sharedWords, sharesAppointment, score };
    })
    .filter((relation) => relation.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.thought.createdAt) - Date.parse(a.thought.createdAt))
    .slice(0, limit);
}

export function unlinkedThoughts(thoughts: Thought[]) {
  return thoughts.filter((thought) => !thought.appointmentId);
}

export function suggestedTags(thoughts: Thought[], excluded: string[] = [], query = '', limit = 8, preferredAppointmentIds: string[] = []) {
  const excludedTags = new Set(excluded.map(normalizeTag));
  const preferredAppointments = new Set(preferredAppointmentIds);
  const wanted = normalizeTag(query);
  const counts = new Map<string, { total: number; contextual: number }>();
  thoughts.forEach((thought) => thought.tags.forEach((tag) => {
    const normalized = normalizeTag(tag);
    if (normalized && !excludedTags.has(normalized) && (!wanted || normalized.includes(wanted))) {
      const count = counts.get(normalized) ?? { total: 0, contextual: 0 };
      counts.set(normalized, {
        total: count.total + 1,
        contextual: count.contextual + Number(preferredAppointments.has(thought.appointmentId)),
      });
    }
  }));
  return [...counts.entries()]
    .sort((a, b) => b[1].contextual - a[1].contextual || b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

export type AppointmentSuggestion = {
  appointment: Appointment;
  sharedWords: string[];
};

export function suggestedAppointments(
  appointments: Appointment[],
  thoughts: Thought[],
  text = '',
  now = new Date(),
  limit = 3,
): AppointmentSuggestion[] {
  const earliest = now.getTime() - 7 * 86_400_000;
  const latest = now.getTime() + 30 * 86_400_000;
  const wanted = new Set(tokenize(text));

  return appointments
    .map((appointment) => {
      const startsAt = Date.parse(appointment.startsAt);
      const linkedThoughts = thoughts.filter((thought) => thought.appointmentId === appointment.id);
      const appointmentWords = new Set(tokenize([
        appointment.title,
        appointment.location,
        ...appointment.agenda.map((item) => item.text),
        ...linkedThoughts.flatMap((thought) => [thought.text, ...thought.tags]),
      ].join(' ')));
      const sharedWords = [...wanted].filter((word) => appointmentWords.has(word));
      return { appointment, startsAt, sharedWords };
    })
    .filter(({ startsAt }) => Number.isFinite(startsAt) && startsAt >= earliest && startsAt <= latest)
    .sort((a, b) => b.sharedWords.length - a.sharedWords.length
      || Math.abs(a.startsAt - now.getTime()) - Math.abs(b.startsAt - now.getTime())
      || a.startsAt - b.startsAt)
    .slice(0, limit)
    .map(({ appointment, sharedWords }) => ({ appointment, sharedWords }));
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function searchTokens(value: string) {
  return normalizeSearchText(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function normalizeTag(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function upcomingAppointments(appointments: Appointment[], now = new Date()) {
  return appointments.filter((appointment) => Date.parse(appointment.startsAt) >= now.getTime()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export type AppointmentGroup = {
  dateKey: string;
  appointments: Appointment[];
};

export function groupUpcomingAppointments(appointments: Appointment[], now = new Date()): AppointmentGroup[] {
  return upcomingAppointments(appointments, now).reduce<AppointmentGroup[]>((groups, appointment) => {
    const dateKey = localDateKey(new Date(appointment.startsAt));
    const current = groups[groups.length - 1];
    if (current?.dateKey === dateKey) current.appointments.push(appointment);
    else groups.push({ dateKey, appointments: [appointment] });
    return groups;
  }, []);
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return localDateKey(new Date(year, month - 1, day)) === value;
}

export function localDateFromKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateKeyAfter(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function isTaskRecurrence(value: unknown): value is TaskRecurrence {
  return value === 'once' || value === 'daily' || value === 'weekly' || value === 'monthly';
}

export function taskPostponeLimit(recurrence: TaskRecurrence): number | null {
  if (recurrence === 'daily') return 0;
  if (recurrence === 'weekly') return 2;
  if (recurrence === 'monthly') return 5;
  return null;
}

export function canPostponeTask(task: DailyTask): boolean {
  const limit = taskPostponeLimit(task.recurrence);
  return limit === null || task.offsetCount < limit;
}

function dateKeyUtcValue(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function taskCarryOverLabel(task: DailyTask, today = localDateKey()): string {
  if (task.recurrence === 'daily' || task.completedOn === today || task.scheduledFor >= today) return '';
  const elapsedDays = Math.floor((dateKeyUtcValue(today) - dateKeyUtcValue(task.scheduledFor)) / 86_400_000);
  if (!Number.isFinite(elapsedDays) || elapsedDays < 1) return '';
  return elapsedDays === 1 ? 'Planned yesterday' : `Planned ${elapsedDays} days ago`;
}

function monthlyDateFromAnchor(anchor: string, monthOffset: number): string {
  const [anchorYear, anchorMonth, anchorDay] = anchor.split('-').map(Number);
  const first = new Date(anchorYear, anchorMonth - 1 + monthOffset, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return localDateKey(new Date(first.getFullYear(), first.getMonth(), Math.min(anchorDay, lastDay)));
}

export function nextTaskOccurrence(anchor: string, afterDate: string, recurrence: TaskRecurrence): string {
  if (recurrence === 'daily') return dateKeyAfter(afterDate, 1);
  if (recurrence === 'weekly') {
    if (anchor > afterDate) return anchor;
    const elapsedDays = Math.floor((dateKeyUtcValue(afterDate) - dateKeyUtcValue(anchor)) / 86_400_000);
    return dateKeyAfter(anchor, (Math.floor(elapsedDays / 7) + 1) * 7);
  }
  if (recurrence === 'monthly') {
    const [anchorYear, anchorMonth] = anchor.split('-').map(Number);
    const [afterYear, afterMonth] = afterDate.split('-').map(Number);
    let monthOffset = Math.max(0, (afterYear - anchorYear) * 12 + afterMonth - anchorMonth);
    let candidate = monthlyDateFromAnchor(anchor, monthOffset);
    if (candidate <= afterDate) candidate = monthlyDateFromAnchor(anchor, ++monthOffset);
    return candidate;
  }
  return afterDate;
}

export function updateTaskSchedule(task: DailyTask, recurrence: TaskRecurrence, requestedDate: string, today = localDateKey()): DailyTask {
  const scheduledRecurrence = recurrence !== 'once';
  const calendarRecurrence = recurrence === 'weekly' || recurrence === 'monthly';
  if (task.recurrence === recurrence && (!scheduledRecurrence || task.scheduledFor === requestedDate)) return task;

  const completedToday = task.completedOn === today;
  if (scheduledRecurrence) {
    const anchor = isLocalDateKey(requestedDate) && requestedDate >= today ? requestedDate : today;
    const sameRecurrence = task.recurrence === recurrence;
    return {
      ...task,
      recurrence,
      recurrenceAnchor: anchor,
      scheduledFor: completedToday && calendarRecurrence ? nextTaskOccurrence(anchor, today, recurrence) : anchor,
      completedOn: sameRecurrence ? task.completedOn : completedToday ? today : null,
      offsetCount: 0,
      completedOccurrence: completedToday && calendarRecurrence
        ? task.completedOccurrence ?? { scheduledFor: task.scheduledFor, offsetCount: task.offsetCount }
        : undefined,
    };
  }

  return {
    ...task,
    recurrence,
    recurrenceAnchor: today,
    scheduledFor: today,
    completedOn: completedToday ? today : null,
    offsetCount: 0,
    completedOccurrence: undefined,
  };
}

export function toggleTaskCompletion(task: DailyTask, today = localDateKey()): DailyTask {
  if (task.completedOn === today) {
    if (task.completedOccurrence) {
      const completedOccurrence = task.completedOccurrence;
      const { completedOccurrence: _completedOccurrence, ...openTask } = task;
      return {
        ...openTask,
        completedOn: null,
        scheduledFor: completedOccurrence.scheduledFor,
        offsetCount: completedOccurrence.offsetCount,
      };
    }
    return { ...task, completedOn: null };
  }
  if (task.recurrence === 'weekly' || task.recurrence === 'monthly') {
    return {
      ...task,
      completedOn: today,
      completedOccurrence: { scheduledFor: task.scheduledFor, offsetCount: task.offsetCount },
      scheduledFor: nextTaskOccurrence(task.recurrenceAnchor, today, task.recurrence),
      offsetCount: 0,
    };
  }
  return { ...task, completedOn: today };
}

export function tasksForToday(tasks: DailyTask[], today = localDateKey()) {
  return tasks.filter((task) => task.completedOn === today
    || (task.recurrence === 'daily' && task.scheduledFor <= today)
    || ((task.recurrence === 'weekly' || task.recurrence === 'monthly' || !task.completedOn) && task.scheduledFor <= today));
}

export function tasksForTomorrow(tasks: DailyTask[], today = localDateKey()) {
  const tomorrow = dateKeyAfter(today, 1);
  return tasks.filter((task) => task.completedOn !== today
    && (task.recurrence === 'daily' || task.recurrence === 'weekly' || task.recurrence === 'monthly' || !task.completedOn)
    && task.scheduledFor === tomorrow);
}

export function tasksScheduledAhead(tasks: DailyTask[], today = localDateKey()) {
  const tomorrow = dateKeyAfter(today, 1);
  return tasks.filter((task) => task.recurrence !== 'once'
    && task.completedOn !== today
    && task.scheduledFor > tomorrow)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function describeCountdown(isoDate: string, now = new Date()) {
  const target = new Date(isoDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const days = Math.round((targetDay.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return days === -1 ? 'Yesterday' : `${Math.abs(days)} days ago`;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export function reminderTime(startsAt: string, reminderMinutes: number) {
  return new Date(Date.parse(startsAt) - reminderMinutes * 60_000);
}

export function reminderLabel(minutes: number) {
  return REMINDER_OPTIONS.find((item) => item.value === minutes)?.label ?? `${minutes} min`;
}
