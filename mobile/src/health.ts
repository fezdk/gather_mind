import {
  dateKeyAfter, isLocalDateKey, localDateKey,
  type HealthRating, type HealthState,
} from './model';

export type HealthField = 'mood' | 'sleep';

export type CycleForecast = {
  estimatedStart: string;
  typicalCycleDays: number;
  intervalsUsed: number;
  rangeDays: number;
  daysUntil: number;
};

export type CycleTodayInsight = {
  message: string;
  detail: string;
};

export type CycleHistorySummary = {
  typicalCycleDays: number | null;
  cycleIntervalsUsed: number;
  cycleRangeDays: number | null;
  typicalPeriodDays: number | null;
  periodDurationsUsed: number;
  periodRangeDays: number | null;
};

const MOOD_LABELS: Record<HealthRating, string> = {
  1: 'Very low',
  2: 'Low',
  3: 'Okay',
  4: 'Good',
  5: 'Very good',
};

const SLEEP_LABELS: Record<HealthRating, string> = {
  1: 'Very poor',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Very good',
};

function dateNumber(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function daysBetween(from: string, to: string) {
  return dateNumber(to) - dateNumber(from);
}

export function periodDurationDays(start: string, end: string) {
  return isLocalDateKey(start) && isLocalDateKey(end) && end >= start ? daysBetween(start, end) + 1 : null;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function healthRatingLabel(field: HealthField, rating: HealthRating) {
  return field === 'mood' ? MOOD_LABELS[rating] : SLEEP_LABELS[rating];
}

export function setDailyHealthRating(
  health: HealthState,
  date: string,
  field: HealthField,
  rating: HealthRating,
): HealthState {
  if (!isLocalDateKey(date)) return health;
  const existing = health.checkIns.find((checkIn) => checkIn.date === date);
  const nextValue = existing?.[field] === rating ? null : rating;
  const nextCheckIn = {
    date,
    mood: field === 'mood' ? nextValue : existing?.mood ?? null,
    sleep: field === 'sleep' ? nextValue : existing?.sleep ?? null,
  };
  const otherCheckIns = health.checkIns.filter((checkIn) => checkIn.date !== date);
  const checkIns = nextCheckIn.mood === null && nextCheckIn.sleep === null
    ? otherCheckIns
    : [...otherCheckIns, nextCheckIn].sort((a, b) => b.date.localeCompare(a.date));
  return { ...health, checkIns };
}

export function addPeriodStart(health: HealthState, date: string, today = localDateKey()): HealthState {
  if (!isLocalDateKey(date) || date > today || health.periods.some((period) => period.start === date)) return health;
  const previousPeriod = health.periods.filter((period) => period.start < date).sort((a, b) => b.start.localeCompare(a.start))[0];
  if (previousPeriod?.end && previousPeriod.end >= date) return health;
  return { ...health, periods: [...health.periods, { start: date, end: null }].sort((a, b) => b.start.localeCompare(a.start)) };
}

export function setPeriodEnd(health: HealthState, start: string, end: string | null, today = localDateKey()): HealthState {
  const period = health.periods.find((item) => item.start === start);
  if (!period || (end !== null && (!isLocalDateKey(end) || end < start || end > today))) return health;
  const nextStart = health.periods.map((item) => item.start).filter((date) => date > start).sort()[0];
  if (end !== null && nextStart && end >= nextStart) return health;
  if (period.end === end) return health;
  return { ...health, periods: health.periods.map((item) => item.start === start ? { ...item, end } : item) };
}

export function removePeriod(health: HealthState, start: string): HealthState {
  const periods = health.periods.filter((period) => period.start !== start);
  return periods.length === health.periods.length ? health : { ...health, periods };
}

export function clearHealthHistory(health: HealthState): HealthState {
  return { ...health, checkIns: [], periods: [] };
}

function recentCycleIntervals(health: HealthState, today: string) {
  const starts = [...new Set(health.periods.map((period) => period.start))]
    .filter(isLocalDateKey)
    .filter((date) => date <= today)
    .sort()
    .slice(-7);
  const rawIntervals = starts.slice(1).map((date, index) => daysBetween(starts[index], date));
  const usefulInterval = (days: number) => days >= 15 && days <= 120;
  return { starts, rawIntervals, intervals: rawIntervals.filter(usefulInterval), latestIsUseful: rawIntervals.length > 0 && usefulInterval(rawIntervals[rawIntervals.length - 1]) };
}

export function cycleHistorySummary(health: HealthState, today = localDateKey()): CycleHistorySummary {
  const { rawIntervals } = recentCycleIntervals(health, today);
  const durations = health.periods
    .filter((period) => period.start <= today && period.end !== null && period.end <= today)
    .map((period) => periodDurationDays(period.start, period.end as string))
    .filter((days): days is number => days !== null)
    .slice(0, 8);
  return {
    typicalCycleDays: rawIntervals.length ? median(rawIntervals) : null,
    cycleIntervalsUsed: rawIntervals.length,
    cycleRangeDays: rawIntervals.length ? Math.max(...rawIntervals) - Math.min(...rawIntervals) : null,
    typicalPeriodDays: durations.length ? median(durations) : null,
    periodDurationsUsed: durations.length,
    periodRangeDays: durations.length ? Math.max(...durations) - Math.min(...durations) : null,
  };
}

export function cycleForecast(health: HealthState, today = localDateKey()): CycleForecast | null {
  const { starts, intervals, latestIsUseful } = recentCycleIntervals(health, today);
  if (starts.length < 2) return null;
  // Never anchor a forecast on a latest entry that is too close to the prior
  // start (or follows a very long gap), even if older intervals were usable.
  if (!latestIsUseful) return null;

  const typicalCycleDays = median(intervals);
  const latestStart = starts[starts.length - 1];
  const estimatedStart = dateKeyAfter(latestStart, typicalCycleDays);
  return {
    estimatedStart,
    typicalCycleDays,
    intervalsUsed: intervals.length,
    rangeDays: Math.max(...intervals) - Math.min(...intervals),
    daysUntil: daysBetween(today, estimatedStart),
  };
}

export function cycleTodayInsight(health: HealthState, today = localDateKey()): CycleTodayInsight | null {
  if (!health.enabled || !health.cycleTrackingEnabled) return null;
  const forecast = cycleForecast(health, today);
  if (!forecast || forecast.daysUntil < 0 || forecast.daysUntil > 5) return null;
  const message = forecast.daysUntil === 0
    ? 'Your next cycle may start around today.'
    : forecast.daysUntil === 1
      ? 'Your next cycle may start around tomorrow.'
      : `Your next cycle may start in about ${forecast.daysUntil} days.`;
  return {
    message,
    detail: 'You may notice changes in mood, sleep, or energy. This is only an estimate based on your entries.',
  };
}
