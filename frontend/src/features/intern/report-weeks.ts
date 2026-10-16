import type { WeeklyReportStatus } from './types';

export const REPORT_STATUS_LABELS: Record<WeeklyReportStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted — awaiting review',
  ACCEPTED: 'Accepted',
  RETURNED: 'Returned for changes',
};

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Monday of the week containing the date (dates are handled in UTC).
export function mondayOf(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return toIso(date);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

// Reportable weeks: those overlapping the placement that have started,
// newest first (the server applies the same rule).
export function reportableWeeks(startDate: string, endDate: string, today: string): string[] {
  const weeks: string[] = [];
  const last = mondayOf(today < endDate ? today : endDate);
  for (let week = mondayOf(startDate); week <= last; week = addDays(week, 7)) {
    weeks.push(week);
  }
  return weeks.reverse();
}

export function formatWeek(weekStart: string): string {
  const format = (value: string) =>
    new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(`${value}T00:00:00Z`));
  return `${format(weekStart)} – ${format(addDays(weekStart, 6))}`;
}

export const MY_REPORTS_KEY = ['intern', 'weekly-reports'] as const;
