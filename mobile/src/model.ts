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

export type DailyTask = {
  id: string;
  title: string;
  scheduledFor: string;
  completedOn: string | null;
  isDaily: boolean;
  offsetCount: number;
  createdAt: string;
};

export type AppState = {
  version: 2;
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
  return { version: 2, thoughts: [], appointments: [], tasks: [] };
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

const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'before', 'bring', 'but', 'for', 'from', 'have', 'into', 'just', 'need', 'not', 'that', 'the', 'then', 'there', 'this', 'want', 'with', 'your']);

export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function tokenize(value = '') {
  return [...new Set(value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)))];
}

export function searchThoughts(thoughts: Thought[], query: string) {
  const wanted = tokenize(query);
  if (!wanted.length) return [...thoughts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return thoughts
    .map((thought) => {
      const words = tokenize(`${thought.text} ${thought.tags.join(' ')}`);
      const searchable = `${thought.text} ${thought.tags.join(' ')}`.toLocaleLowerCase();
      const score = (searchable.includes(query.toLocaleLowerCase()) ? 4 : 0) + wanted.reduce((total, word) => total + (words.some((candidate) => candidate.includes(word)) ? 2 : 0), 0);
      return { thought, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ thought }) => thought);
}

export function upcomingAppointments(appointments: Appointment[], now = new Date()) {
  return appointments.filter((appointment) => Date.parse(appointment.startsAt) >= now.getTime()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateKeyAfter(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function tasksForToday(tasks: DailyTask[], today = localDateKey()) {
  return tasks
    .filter((task) => task.isDaily || task.completedOn === today || (!task.completedOn && task.scheduledFor <= today))
    .sort((a, b) => Number(a.completedOn === today) - Number(b.completedOn === today) || b.offsetCount - a.offsetCount || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export function tasksForTomorrow(tasks: DailyTask[], today = localDateKey()) {
  const tomorrow = dateKeyAfter(today, 1);
  return tasks.filter((task) => !task.isDaily && !task.completedOn && task.scheduledFor === tomorrow);
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
