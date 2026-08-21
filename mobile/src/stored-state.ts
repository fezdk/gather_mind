import { isLocalDateKey, isTaskRecurrence, type AppState, type EditorDraft } from './model';

type LegacyTask = Omit<AppState['tasks'][number], 'recurrence' | 'recurrenceAnchor' | 'completedOccurrence'> & { isDaily: boolean };
type LegacyStateV2 = Omit<AppState, 'version' | 'tasks'> & { version: 2; tasks: LegacyTask[] };
type LegacyStateV1 = Omit<AppState, 'version' | 'tasks'> & { version: 1 };

export function parseStoredState(raw: string, source: string): AppState {
  let parsed: AppState | LegacyStateV2 | LegacyStateV1;
  try {
    parsed = JSON.parse(raw) as AppState | LegacyStateV2 | LegacyStateV1;
  } catch {
    throw new Error(`${source} contains data Gather Mind cannot read. It was left untouched.`);
  }
  if (parsed.version === 3 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    return parsed;
  }
  if (parsed.version === 2 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments) && Array.isArray(parsed.tasks)) {
    return {
      ...parsed,
      version: 3,
      tasks: parsed.tasks.map(({ isDaily, ...task }) => ({
        ...task,
        recurrence: isDaily ? 'daily' : 'once',
        recurrenceAnchor: task.scheduledFor,
      })),
    };
  }
  if (parsed.version === 1 && Array.isArray(parsed.thoughts) && Array.isArray(parsed.appointments)) {
    return { ...parsed, version: 3, tasks: [] };
  }
  throw new Error(`${source} has an unsupported format. It was left untouched.`);
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
    if (isTaskRecurrence(draft.recurrence)
      && (draft.scheduledFor === undefined || isLocalDateKey(draft.scheduledFor))) return draft as EditorDraft;
    if (typeof draft.isDaily === 'boolean') {
      return { kind: 'task', itemId: draft.itemId as string | null, title: draft.title, recurrence: draft.isDaily ? 'daily' : 'once' };
    }
  }
  if (draft.kind === 'appointment' && nullableString(draft.itemId) && typeof draft.title === 'string'
    && typeof draft.startsAt === 'string' && typeof draft.location === 'string'
    && typeof draft.reminderMinutes === 'number') return draft as EditorDraft;
  if (draft.kind === 'agenda' && typeof draft.appointmentId === 'string' && nullableString(draft.itemId)
    && typeof draft.text === 'string') return draft as EditorDraft;
  return null;
}
