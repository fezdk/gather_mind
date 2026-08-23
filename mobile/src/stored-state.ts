import { isLocalDateKey, isTaskRecurrence, type AppState, type EditorDraft, type TaskStep } from './model';

type LegacyTaskV3 = Omit<AppState['tasks'][number], 'steps' | 'stepProgress'>;
type LegacyStateV3 = Omit<AppState, 'version' | 'tasks'> & { version: 3; tasks: LegacyTaskV3[] };
type LegacyTask = Omit<AppState['tasks'][number], 'recurrence' | 'recurrenceAnchor' | 'completedOccurrence' | 'steps' | 'stepProgress'> & { isDaily: boolean };
type LegacyStateV2 = Omit<AppState, 'version' | 'tasks'> & { version: 2; tasks: LegacyTask[] };
type LegacyStateV1 = Omit<AppState, 'version' | 'tasks'> & { version: 1 };

export function parseStoredState(raw: string, source: string): AppState {
  let parsed: AppState | LegacyStateV3 | LegacyStateV2 | LegacyStateV1;
  try {
    parsed = JSON.parse(raw) as AppState | LegacyStateV3 | LegacyStateV2 | LegacyStateV1;
  } catch {
    throw new Error(`${source} contains data Gather Mind cannot read. It was left untouched.`);
  }
  if (parsed.version === 4 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    return parsed;
  }
  if (parsed.version === 3 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    return { ...parsed, version: 4, tasks: parsed.tasks.map((task) => ({ ...task, steps: [] })) };
  }
  if (parsed.version === 2 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    return {
      ...parsed,
      version: 4,
      tasks: parsed.tasks.map(({ isDaily, ...task }) => ({
        ...task,
        recurrence: isDaily ? 'daily' : 'once',
        recurrenceAnchor: task.scheduledFor,
        steps: [],
      })),
    };
  }
  if (parsed.version === 1 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments)) {
    return { ...parsed, version: 4, tasks: [] };
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
