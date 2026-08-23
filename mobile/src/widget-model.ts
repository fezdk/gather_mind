import { type AppState, dateKeyAfter, localDateKey, tasksForToday } from './model';

export const WIDGET_SNAPSHOT_DAYS = 32;
const WIDGET_TITLE_LIMIT = 160;

export type WidgetRoute =
  | { kind: 'today' }
  | { kind: 'goal'; id: string }
  | { kind: 'appointment'; id: string };

export type WidgetSnapshot = {
  version: 1;
  generatedAt: number;
  showDetails: boolean;
  days: Array<{
    date: string;
    completed: number;
    total: number;
    goals: Array<{ id: string; title: string }>;
  }>;
  appointments: Array<{ id: string; title: string; startsAt: number }>;
};

export function buildWidgetSnapshot(
  state: AppState,
  showDetails: boolean,
  now = new Date(),
): WidgetSnapshot {
  const firstDate = localDateKey(now);
  const days = Array.from({ length: WIDGET_SNAPSHOT_DAYS }, (_, offset) => {
    const date = dateKeyAfter(firstDate, offset);
    const goals = tasksForToday(state.tasks, date);
    return {
      date,
      completed: goals.filter((goal) => goal.completedOn === date).length,
      total: goals.length,
      goals: showDetails
        ? goals.filter((goal) => goal.completedOn !== date).slice(0, 3).map((goal) => ({ id: goal.id, title: widgetTitle(goal.title) }))
        : [],
    };
  });
  return {
    version: 1,
    generatedAt: now.getTime(),
    showDetails,
    days,
    appointments: state.appointments
      .flatMap((appointment) => {
        const startsAt = Date.parse(appointment.startsAt);
        return Number.isFinite(startsAt) && startsAt >= now.getTime()
          ? [{ id: appointment.id, title: showDetails ? widgetTitle(appointment.title) : '', startsAt }]
          : [];
      })
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, 12),
  };
}

export function parseWidgetRoute(url: string): WidgetRoute | null {
  const match = /^gathermind:\/\/(today|goal|appointment)(?:\/([^/?#]+))?(?:[?#].*)?$/i.exec(url.trim());
  if (!match) return null;
  const kind = match[1].toLowerCase();
  if (kind === 'today') return match[2] ? null : { kind: 'today' };
  if (!match[2]) return null;
  try {
    const id = decodeURIComponent(match[2]);
    return id ? { kind: kind as 'goal' | 'appointment', id } : null;
  } catch {
    return null;
  }
}

function widgetTitle(value: string): string {
  return value.trim().slice(0, WIDGET_TITLE_LIMIT);
}
