import { DailyTask, dateKeyAfter, localDateFromKey, localDateKey, tasksForToday } from './model';

export const DEFAULT_DAILY_STATUS_MINUTES = 18 * 60;
export const DAILY_STATUS_SCHEDULE_DAYS = 7;

export type DailyStatusPlanItem = {
  dateKey: string;
  count: number;
  target: Date;
};

export function validDailyStatusMinutes(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 24 * 60;
}

export function unfinishedGoalCount(tasks: DailyTask[], dateKey: string): number {
  return tasksForToday(tasks, dateKey).filter((task) => task.completedOn !== dateKey).length;
}

export function dateAtLocalMinutes(dateKey: string, minutes: number): Date {
  const date = localDateFromKey(dateKey);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

export function dailyStatusPlan(
  tasks: DailyTask[],
  minutes: number,
  now = new Date(),
  includePastToday = false,
  days = DAILY_STATUS_SCHEDULE_DAYS,
): DailyStatusPlanItem[] {
  if (!validDailyStatusMinutes(minutes)) throw new Error('Unsupported daily status time.');
  const today = localDateKey(now);
  const plan: DailyStatusPlanItem[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const dateKey = dateKeyAfter(today, offset);
    const count = unfinishedGoalCount(tasks, dateKey);
    if (!count) continue;
    const target = dateAtLocalMinutes(dateKey, minutes);
    if (target.getTime() <= now.getTime()) {
      if (offset > 0 || !includePastToday) continue;
      target.setTime(now.getTime() + 1000);
    }
    plan.push({ dateKey, count, target });
  }
  return plan;
}
