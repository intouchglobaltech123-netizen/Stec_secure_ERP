// Payroll for a period: each person's monthly salary for the days in the period (part-months counted by
// days in that month) plus incentives for finished jobs they worked on. Hours and holds are shown
// alongside. Pure — used by the Reports page (CEO only).
import type { HoldEvent, Job, PayProfile, User, WorkLog } from './stecsecure-types';
import { DateRange, inRange, rangeBounds } from './date-range';
import { localDateISO } from './numbering';

const DAY_MS = 86_400_000;

export interface PayrollRow {
  user: User;
  profile?: PayProfile;
  monthlySalary: number;
  days: number; // days of the period counted for salary
  salary: number; // salary for those days
  serviceJobs: number;
  installationJobs: number;
  serviceIncentive: number; // rate per job
  installationIncentive: number;
  incentives: number;
  hours: number;
  holds: number;
  total: number;
}

export interface PayrollResult {
  rows: PayrollRow[];
  from: string; // India dates the salary was worked out for
  to: string;
  days: number;
}

const dayParts = (iso: string) => iso.split('-').map(Number) as [number, number, number];
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Salary for the India calendar days from..to (inclusive): each month's share by its own length
export function salaryForDays(monthly: number, from: string, to: string): { salary: number; days: number } {
  if (!monthly || from > to) return { salary: 0, days: 0 };
  let salary = 0;
  let days = 0;
  let [y, m, d] = dayParts(from);
  const [ty, tm, td] = dayParts(to);
  while (y < ty || (y === ty && m <= tm)) {
    const dim = daysInMonth(y, m);
    const first = d;
    const last = y === ty && m === tm ? td : dim;
    const count = last - first + 1;
    salary += (monthly * count) / dim;
    days += count;
    d = 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return { salary: Math.round(salary * 100) / 100, days };
}

// Hours on the work log inside the period (an open session counts up to now, unless left over 12 hours)
export function hoursWorked(workLogs: WorkLog[], userId: string, range: DateRange, nowMs = Date.now()): number {
  const { start, end } = rangeBounds(range);
  let ms = 0;
  for (const wl of workLogs) {
    if (wl.userId !== userId || !wl.inTime) continue;
    const inMs = new Date(wl.inTime).getTime();
    const outMs = wl.outTime ? new Date(wl.outTime).getTime() : nowMs - inMs < 12 * 3_600_000 ? nowMs : inMs;
    const from = Math.max(inMs, start);
    const to = Math.min(outMs, end);
    if (to > from) ms += to - from;
  }
  return Math.round((ms / 3_600_000) * 10) / 10;
}

export function computePayroll(
  input: { users: User[]; payProfiles: PayProfile[]; jobs: Job[]; workLogs: WorkLog[]; holdEvents: HoldEvent[] },
  range: DateRange,
  now: Date = new Date()
): PayrollResult {
  // The salary period: the chosen dates; an open start begins at the first job on record
  const { start, end } = rangeBounds(range);
  const today = localDateISO(now);
  const earliest = input.jobs.reduce<string>((min, j) => {
    const d = j.createdAt ? localDateISO(new Date(j.createdAt)) : today;
    return d < min ? d : min;
  }, today);
  const from = Number.isFinite(start) ? localDateISO(new Date(start)) : earliest;
  const to = Number.isFinite(end) ? localDateISO(new Date(end)) : today;
  const periodDays = from <= to ? Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1 : 0;

  const profiles = new Map(input.payProfiles.map((p) => [p.id, p]));
  const finished = input.jobs.filter(
    (j) => (j.status === 'COMPLETED' || j.status === 'CLOSED') && inRange(j.completedAt || j.createdAt, range)
  );

  const rows = input.users.map((user): PayrollRow => {
    const profile = profiles.get(user.id);
    const monthlySalary = profile?.monthlySalary ?? 0;
    const { salary, days } = salaryForDays(monthlySalary, from, to);
    const mine = finished.filter((j) => j.assignedTeam.includes(user.id) || j.teamLeadUserId === user.id);
    const serviceJobs = mine.filter((j) => j.type === 'SERVICE').length;
    const installationJobs = mine.filter((j) => j.type === 'INSTALLATION').length;
    const serviceIncentive = profile?.serviceIncentive ?? 0;
    const installationIncentive = profile?.installationIncentive ?? 0;
    const incentives = serviceJobs * serviceIncentive + installationJobs * installationIncentive;
    return {
      user,
      profile,
      monthlySalary,
      days: monthlySalary ? days : periodDays,
      salary,
      serviceJobs,
      installationJobs,
      serviceIncentive,
      installationIncentive,
      incentives,
      hours: hoursWorked(input.workLogs, user.id, range, now.getTime()),
      holds: input.holdEvents.filter((h) => h.raisedByUserId === user.id && inRange(h.raisedAt, range)).length,
      total: Math.round((salary + incentives) * 100) / 100,
    };
  });

  return { rows, from, to, days: periodDays };
}
