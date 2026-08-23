import { type EditorDraft, type TaskStep } from './model';

function preparedSteps(steps: TaskStep[]) {
  return steps.flatMap((step) => {
    const text = step.text.trim();
    return text ? [{ id: step.id, text }] : [];
  });
}

function sameSteps(left: TaskStep[], right: TaskStep[]) {
  const preparedLeft = preparedSteps(left);
  const preparedRight = preparedSteps(right);
  return preparedLeft.length === preparedRight.length
    && preparedLeft.every((step, index) => step.id === preparedRight[index]?.id && step.text === preparedRight[index]?.text);
}

function preparedTags(value: string) {
  return [...new Set(value.split(',').map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean))];
}

function sameTags(left: string, right: string) {
  const preparedLeft = preparedTags(left);
  const preparedRight = preparedTags(right);
  return preparedLeft.length === preparedRight.length
    && preparedLeft.every((tag, index) => tag === preparedRight[index]);
}

/**
 * Compares what a form would save, rather than insignificant presentation
 * differences such as surrounding whitespace or an empty unfinished step.
 */
export function editorDraftHasChanges(draft: EditorDraft | null, baseline: EditorDraft | null): boolean {
  if (!draft) return false;
  if (!baseline || draft.kind !== baseline.kind) return true;

  if (draft.kind === 'thought' && baseline.kind === 'thought') {
    return draft.itemId !== baseline.itemId
      || draft.text.trim() !== baseline.text.trim()
      || !sameTags(draft.tags, baseline.tags)
      || draft.appointmentId !== baseline.appointmentId;
  }

  if (draft.kind === 'task' && baseline.kind === 'task') {
    return draft.itemId !== baseline.itemId
      || draft.title.trim() !== baseline.title.trim()
      || draft.recurrence !== baseline.recurrence
      || draft.scheduledFor !== baseline.scheduledFor
      || !sameSteps(draft.steps, baseline.steps);
  }

  if (draft.kind === 'appointment' && baseline.kind === 'appointment') {
    return draft.itemId !== baseline.itemId
      || draft.title.trim() !== baseline.title.trim()
      || draft.startsAt !== baseline.startsAt
      || draft.location.trim() !== baseline.location.trim()
      || draft.reminderMinutes !== baseline.reminderMinutes;
  }

  if (draft.kind === 'agenda' && baseline.kind === 'agenda') {
    return draft.appointmentId !== baseline.appointmentId
      || draft.itemId !== baseline.itemId
      || draft.text.trim() !== baseline.text.trim();
  }

  return true;
}
