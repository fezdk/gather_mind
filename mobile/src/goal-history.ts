import { dateKeyAfter, isLocalDateKey, isTaskRecurrence, localDateFromKey, localDateKey, tasksForToday, taskStepSummary, type AppState, type GoalDaySnapshot } from './model';

// Only observed days are recorded. Never reconstruct old days from mutable
// routines: completedOn contains only the most recent completion.
export function captureGoalDay(state: AppState, today = localDateKey()): AppState {
  const latest = state.goalHistory[state.goalHistory.length - 1];
  // A clock/time-zone move backwards must not rewrite an already closed day.
  if (latest && latest.date > today) return state;
  const snapshot: GoalDaySnapshot = {
    date: today,
    goals: tasksForToday(state.tasks, today).map(task => {
      const checked = new Set(taskStepSummary(task, today).completedStepIds);
      return {
        id: task.id, title: task.title, recurrence: task.recurrence,
        completed: task.completedOn === today,
        steps: task.steps.map(step => ({ id: step.id, text: step.text, completed: checked.has(step.id) })),
      };
    }),
  };
  if (latest?.date === today && JSON.stringify(latest) === JSON.stringify(snapshot)) return state;
  const closedDays = latest?.date === today ? state.goalHistory.slice(0, -1) : state.goalHistory;
  return { ...state, goalHistory: [...closedDays, snapshot] };
}

export function goalDaySummary(snapshot: GoalDaySnapshot | undefined): string {
  if (!snapshot) return 'No saved history';
  if (!snapshot.goals.length) return 'No goals planned';
  return `${snapshot.goals.filter(goal => goal.completed).length} of ${snapshot.goals.length} completed`;
}

export function historyWeekStart(day: string): string {
  return dateKeyAfter(day, -((localDateFromKey(day).getDay() + 6) % 7));
}

export function historyMonthStart(day: string): string { return `${day.slice(0, 7)}-01`; }

export function historyMonthShift(day: string, delta: number): string {
  const date = localDateFromKey(historyMonthStart(day));
  date.setMonth(date.getMonth() + delta);
  return localDateKey(date);
}

export function historyCalendarDays(day: string, mode: 'week' | 'month'): Array<string | null> {
  if (mode === 'week') return Array.from({ length: 7 }, (_, index) => dateKeyAfter(historyWeekStart(day), index));
  const start = historyMonthStart(day);
  const offset = (localDateFromKey(start).getDay() + 6) % 7;
  const last = localDateFromKey(dateKeyAfter(historyMonthShift(day, 1), -1)).getDate();
  const count = Math.ceil((offset + last) / 7) * 7;
  return Array.from({ length: count }, (_, index) => index < offset || index >= offset + last ? null : dateKeyAfter(start, index - offset));
}

// Reject damaged/ambiguous records without silently dropping any saved history.
export function parseGoalHistory(value: unknown): GoalDaySnapshot[] | null {
  if (!Array.isArray(value)) return null;
  const dates = new Set<string>();
  const result: GoalDaySnapshot[] = [];
  for (const day of value) {
    if (!day || !isLocalDateKey(day.date) || dates.has(day.date) || !Array.isArray(day.goals)) return null;
    dates.add(day.date);
    const ids = new Set<string>();
    const goals: GoalDaySnapshot['goals'] = [];
    for (const goal of day.goals) {
      if (!goal || typeof goal.id !== 'string' || !goal.id || ids.has(goal.id) || typeof goal.title !== 'string'
        || !isTaskRecurrence(goal.recurrence) || typeof goal.completed !== 'boolean' || !Array.isArray(goal.steps)) return null;
      ids.add(goal.id);
      const stepIds = new Set<string>();
      const steps: GoalDaySnapshot['goals'][number]['steps'] = [];
      for (const step of goal.steps) {
        if (!step || typeof step.id !== 'string' || !step.id || stepIds.has(step.id)
          || typeof step.text !== 'string' || typeof step.completed !== 'boolean') return null;
        stepIds.add(step.id);
        steps.push({ id: step.id, text: step.text, completed: step.completed });
      }
      goals.push({ id: goal.id, title: goal.title, recurrence: goal.recurrence, completed: goal.completed, steps });
    }
    result.push({ date: day.date, goals });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
