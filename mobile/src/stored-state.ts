import {
  createEmptyHealthState, isLocalDateKey, isTaskRecurrence,
  type AppState, type DailyTask, type EditorDraft, type HealthRating, type HealthState, type TaskStep,
} from './model';

type LegacyTaskV6 = Omit<DailyTask, 'sortOrder'>;
type LegacyStateV6 = Omit<AppState, 'version' | 'tasks'> & { version: 6; tasks: LegacyTaskV6[] };
type LegacyTaskV3 = Omit<LegacyTaskV6, 'steps' | 'stepProgress'>;
type LegacyHealthStateV5 = {
  enabled: boolean;
  checkIns: HealthState['checkIns'];
  cycleStarts: string[];
};
type LegacyStateV5 = Omit<LegacyStateV6, 'version' | 'health'> & { version: 5; health: LegacyHealthStateV5 };
type LegacyStateV4 = Omit<LegacyStateV6, 'version' | 'health'> & { version: 4 };
type LegacyStateV3 = Omit<AppState, 'version' | 'tasks' | 'health'> & { version: 3; tasks: LegacyTaskV3[] };
type LegacyTask = Omit<LegacyTaskV6, 'recurrence' | 'recurrenceAnchor' | 'completedOccurrence' | 'steps' | 'stepProgress'> & { isDaily: boolean };
type LegacyStateV2 = Omit<AppState, 'version' | 'tasks' | 'health'> & { version: 2; tasks: LegacyTask[] };
type LegacyStateV1 = Omit<AppState, 'version' | 'tasks' | 'health'> & { version: 1 };

function addTaskSortOrder<T extends LegacyTaskV6>(tasks: T[]): Array<T & Pick<DailyTask, 'sortOrder'>> {
  return tasks.map((task, index) => ({ ...task, sortOrder: index * 1024 }));
}

function isHealthRating(value: unknown): value is HealthRating {
  return Number.isInteger(value) && typeof value === 'number' && value >= 1 && value <= 5;
}

function parseHealthCheckIns(value: unknown): HealthState['checkIns'] | null {
  if (!Array.isArray(value)) return null;
  const checkIns: HealthState['checkIns'] = [];
  const checkInDates = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const checkIn = item as Record<string, unknown>;
    if (!isLocalDateKey(checkIn.date) || checkInDates.has(checkIn.date)) return null;
    if (checkIn.mood !== null && !isHealthRating(checkIn.mood)) return null;
    if (checkIn.sleep !== null && !isHealthRating(checkIn.sleep)) return null;
    checkInDates.add(checkIn.date);
    checkIns.push({ date: checkIn.date, mood: checkIn.mood, sleep: checkIn.sleep });
  }
  return checkIns.sort((a, b) => b.date.localeCompare(a.date));
}

function parseHealthState(value: unknown): HealthState | null {
  if (!value || typeof value !== 'object') return null;
  const health = value as Record<string, unknown>;
  if (typeof health.enabled !== 'boolean' || typeof health.cycleTrackingEnabled !== 'boolean' || !Array.isArray(health.periods)) return null;
  const checkIns = parseHealthCheckIns(health.checkIns);
  if (!checkIns) return null;

  const periods: HealthState['periods'] = [];
  const starts = new Set<string>();
  for (const item of health.periods) {
    if (!item || typeof item !== 'object') return null;
    const period = item as Record<string, unknown>;
    if (!isLocalDateKey(period.start) || starts.has(period.start)) return null;
    if (period.end !== null && !isLocalDateKey(period.end)) return null;
    if (typeof period.end === 'string' && period.end < period.start) return null;
    starts.add(period.start);
    periods.push({ start: period.start, end: period.end });
  }
  periods.sort((a, b) => b.start.localeCompare(a.start));
  for (let index = 1; index < periods.length; index += 1) {
    const older = periods[index];
    const nextStart = periods[index - 1].start;
    if (older.end && older.end >= nextStart) return null;
  }
  return { enabled: health.enabled, cycleTrackingEnabled: health.cycleTrackingEnabled, checkIns, periods };
}

function parseLegacyHealthState(value: unknown): HealthState | null {
  if (!value || typeof value !== 'object') return null;
  const health = value as Record<string, unknown>;
  if (typeof health.enabled !== 'boolean' || !Array.isArray(health.cycleStarts)) return null;
  const checkIns = parseHealthCheckIns(health.checkIns);
  if (!checkIns) return null;
  const starts = new Set<string>();
  const periods: HealthState['periods'] = [];
  for (const start of health.cycleStarts) {
    if (!isLocalDateKey(start) || starts.has(start)) return null;
    starts.add(start);
    periods.push({ start, end: null });
  }
  periods.sort((a, b) => b.start.localeCompare(a.start));
  return { enabled: health.enabled, cycleTrackingEnabled: health.enabled, checkIns, periods };
}

export function parseStoredState(raw: string, source: string): AppState {
  let parsed: AppState | LegacyStateV6 | LegacyStateV5 | LegacyStateV4 | LegacyStateV3 | LegacyStateV2 | LegacyStateV1;
  try {
    parsed = JSON.parse(raw) as AppState | LegacyStateV6 | LegacyStateV5 | LegacyStateV4 | LegacyStateV3 | LegacyStateV2 | LegacyStateV1;
  } catch {
    throw new Error(`${source} contains data Gather Mind cannot read. It was left untouched.`);
  }
  if (parsed.version === 7 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)
    && parsed.tasks.every((task) => Number.isFinite(task.sortOrder))) {
    const health = parseHealthState(parsed.health);
    if (health) return { ...parsed, health };
  }
  if (parsed.version === 6 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    const health = parseHealthState(parsed.health);
    if (health) return { ...parsed, version: 7, tasks: addTaskSortOrder(parsed.tasks), health };
  }
  if (parsed.version === 5 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    const health = parseLegacyHealthState(parsed.health);
    if (health) return { ...parsed, version: 7, tasks: addTaskSortOrder(parsed.tasks), health };
  }
  if (parsed.version === 4 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    return { ...parsed, version: 7, tasks: addTaskSortOrder(parsed.tasks), health: createEmptyHealthState() };
  }
  if (parsed.version === 3 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    return { ...parsed, version: 7, tasks: addTaskSortOrder(parsed.tasks.map((task) => ({ ...task, steps: [] }))), health: createEmptyHealthState() };
  }
  if (parsed.version === 2 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    return {
      ...parsed,
      version: 7,
      tasks: parsed.tasks.map(({ isDaily, ...task }, index) => ({
        ...task,
        sortOrder: index * 1024,
        recurrence: isDaily ? 'daily' : 'once',
        recurrenceAnchor: task.scheduledFor,
        steps: [],
      })),
      health: createEmptyHealthState(),
    };
  }
  if (parsed.version === 1 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments)) {
    return { ...parsed, version: 7, tasks: [], health: createEmptyHealthState() };
  }
  throw new Error(`${source} has an unsupported format. It was left untouched.`);
}

function parseTaskSteps(value: unknown): TaskStep[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const steps: TaskStep[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const step = item as Record<string, unknown>;
    if (typeof step.id !== 'string' || typeof step.text !== 'string') return null;
    const id = step.id.trim();
    if (!id || ids.has(id)) return null;
    ids.add(id);
    steps.push({ id, text: step.text });
  }
  return steps;
}

export function parseEditorDraft(raw: string): EditorDraft | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || !('kind' in value)) return null;
  const draft = value as Record<string, unknown>;
  const nullableString = (field: unknown) => field === null || typeof field === 'string';
  if (draft.kind === 'thought' && nullableString(draft.itemId) && typeof draft.text === 'string'
    && typeof draft.tags === 'string' && typeof draft.appointmentId === 'string') return draft as EditorDraft;
  if (draft.kind === 'task' && nullableString(draft.itemId) && typeof draft.title === 'string') {
    const steps = parseTaskSteps(draft.steps);
    if (!steps) return null;
    if (isTaskRecurrence(draft.recurrence)
      && (draft.scheduledFor === undefined || isLocalDateKey(draft.scheduledFor))) {
      return {
        kind: 'task', itemId: draft.itemId as string | null, title: draft.title,
        recurrence: draft.recurrence, ...(draft.scheduledFor ? { scheduledFor: draft.scheduledFor } : {}), steps,
      };
    }
    if (typeof draft.isDaily === 'boolean') {
      return { kind: 'task', itemId: draft.itemId as string | null, title: draft.title, recurrence: draft.isDaily ? 'daily' : 'once', steps };
    }
  }
  if (draft.kind === 'appointment' && nullableString(draft.itemId) && typeof draft.title === 'string'
    && typeof draft.startsAt === 'string' && typeof draft.location === 'string'
    && typeof draft.reminderMinutes === 'number') return draft as EditorDraft;
  if (draft.kind === 'agenda' && typeof draft.appointmentId === 'string' && nullableString(draft.itemId)
    && typeof draft.text === 'string') return draft as EditorDraft;
  return null;
}
