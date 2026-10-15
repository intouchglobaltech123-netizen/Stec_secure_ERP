// Date filters shared by the Dashboard, Reports and the technician profile: presets in India time
// (today, this week, this month, this financial year, all time) or a custom From/To, optionally with times.
import { financialYearStart, localDateISO } from './numbering';
import { formatDate, formatDateTime } from './utils';

export type RangePreset = 'TODAY' | 'WEEK' | 'MONTH' | 'FY' | 'ALL' | 'CUSTOM';

export interface DateRange {
  preset: RangePreset;
  // India calendar dates 'YYYY-MM-DD', or 'YYYY-MM-DDTHH:mm' when times are used; '' = no limit
  from: string;
  to: string;
}

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'TODAY', label: 'Today' },
  { value: 'WEEK', label: 'This week' },
  { value: 'MONTH', label: 'This month' },
  { value: 'FY', label: 'This financial year' },
  { value: 'ALL', label: 'All time' },
  { value: 'CUSTOM', label: 'Custom dates' },
];

const DAY_MS = 86_400_000;

// Shifts an India date 'YYYY-MM-DD' by whole days
function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T12:00:00+05:30`) + days * DAY_MS;
  return localDateISO(new Date(t));
}

export function presetRange(preset: RangePreset, now: Date = new Date()): DateRange {
  const today = localDateISO(now);
  switch (preset) {
    case 'TODAY':
      return { preset, from: today, to: today };
    case 'WEEK': {
      // Weeks start on Monday
      const weekday = new Date(`${today}T12:00:00+05:30`).getUTCDay(); // 0 = Sunday
      return { preset, from: addDays(today, -((weekday + 6) % 7)), to: today };
    }
    case 'MONTH':
      return { preset, from: `${today.slice(0, 8)}01`, to: today };
    case 'FY':
      return { preset, from: `${financialYearStart(now)}-04-01`, to: today };
    case 'ALL':
    case 'CUSTOM':
      return { preset, from: '', to: '' };
  }
}

const hasTime = (v: string) => v.includes('T');

// First and last instant (ms) the range covers; open ends are ±Infinity
export function rangeBounds(range: DateRange): { start: number; end: number } {
  const start = range.from
    ? Date.parse(hasTime(range.from) ? `${range.from}:00+05:30` : `${range.from}T00:00:00+05:30`)
    : -Infinity;
  const end = range.to
    ? Date.parse(hasTime(range.to) ? `${range.to}:59.999+05:30` : `${range.to}T23:59:59.999+05:30`)
    : Infinity;
  return { start: Number.isNaN(start) ? -Infinity : start, end: Number.isNaN(end) ? Infinity : end };
}

// Instant of a stored value: a full timestamp, or an India calendar date (taken as midday)
function instantOf(value: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T12:00:00+05:30`) : Date.parse(value);
}

export function inRange(value: string | undefined | null, range: DateRange): boolean {
  if (range.preset === 'ALL') return true;
  if (!value) return false;
  const t = instantOf(value);
  if (Number.isNaN(t)) return false;
  const { start, end } = rangeBounds(range);
  return t >= start && t <= end;
}

// The period of the same length just before this one (for "vs previous period"); null for open ranges
export function previousRange(range: DateRange): DateRange | null {
  const { start, end } = rangeBounds(range);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const length = end - start;
  const prevEnd = start - 1;
  const prevStart = prevEnd - length;
  const fmt = (t: number) => localDateISO(new Date(t));
  return { preset: 'CUSTOM', from: fmt(prevStart), to: fmt(prevEnd) };
}

// Number of days the range spans (open ranges: null)
export function rangeDays(range: DateRange): number | null {
  const { start, end } = rangeBounds(range);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(1, Math.round((end - start) / DAY_MS));
}

export function rangeLabel(range: DateRange): string {
  if (range.preset === 'ALL') return 'All time';
  const show = (v: string) =>
    hasTime(v) ? formatDateTime(new Date(Date.parse(`${v}:00+05:30`)).toISOString()) : formatDate(v);
  if (range.from && range.to) return range.from === range.to ? show(range.from) : `${show(range.from)} – ${show(range.to)}`;
  if (range.from) return `From ${show(range.from)}`;
  if (range.to) return `Up to ${show(range.to)}`;
  return 'All time';
}

// Short text for file names: 2026-04-01_to_2026-10-15, or all-time
export function rangeFileTag(range: DateRange): string {
  if (range.preset === 'ALL' || (!range.from && !range.to)) return 'all-time';
  const d = (v: string) => v.slice(0, 10);
  return `${range.from ? d(range.from) : 'start'}_to_${range.to ? d(range.to) : localDateISO()}`;
}
