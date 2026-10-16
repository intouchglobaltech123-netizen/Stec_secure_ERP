// Leave arithmetic. Each person builds up their paid and casual leave month by month (the CEO sets the
// days per month); unused days carry forward to later months of the same financial year and start
// again every April. Leave is used in date order: paid / casual leave beyond what has built up by that
// day, and all unpaid leave, is loss of pay. Sundays inside the leave dates are not counted.
import type { LeaveRecord, LeaveType, PayProfile } from './stecsecure-types';

export const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'PAID', label: 'Paid leave' },
  { value: 'CASUAL', label: 'Casual leave' },
  { value: 'UNPAID', label: 'Unpaid leave' },
];
export const leaveTypeLabel = (t: LeaveType) => LEAVE_TYPES.find((x) => x.value === t)?.label ?? t;

const DAY_MS = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Each counted day of a leave entry (Sundays skipped), with 0.5 for a half day
export function leaveDayList(rec: Pick<LeaveRecord, 'from' | 'to' | 'halfDay'>): { date: string; amount: number }[] {
  const out: { date: string; amount: number }[] = [];
  for (let t = utc(rec.from); t <= utc(rec.to); t += DAY_MS) {
    if (new Date(t).getUTCDay() === 0) continue;
    out.push({ date: iso(t), amount: rec.halfDay ? 0.5 : 1 });
  }
  return out;
}

export const leaveDays = (rec: Pick<LeaveRecord, 'from' | 'to' | 'halfDay'>) =>
  leaveDayList(rec).reduce((sum, d) => sum + d.amount, 0);

// Financial year (April–March) a date belongs to, as its starting year
const fyOf = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  return m >= 4 ? y : y - 1;
};
// Months of the financial year up to and including the date's month (April = 1)
const monthsIntoFy = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  return (y - fyOf(date)) * 12 + m - 3;
};

export interface LeaveDay {
  date: string;
  type: LeaveType;
  amount: number; // 1 or 0.5
  paid: number; // part covered by the allowance
  unpaid: number; // loss of pay
}

// One person's leave days with the paid / unpaid split, and the balance left on `asOf`
export function leaveLedger(
  records: LeaveRecord[],
  profile: Pick<PayProfile, 'paidLeavePerMonth' | 'casualLeavePerMonth'> | undefined,
  asOf: string
): { days: LeaveDay[]; balance: { PAID: number; CASUAL: number } } {
  const perMonth = { PAID: profile?.paidLeavePerMonth ?? 0, CASUAL: profile?.casualLeavePerMonth ?? 0 };
  const days = records
    .flatMap((r) => leaveDayList(r).map((d) => ({ ...d, type: r.type })))
    .sort((a, b) => a.date.localeCompare(b.date));

  const used = new Map<string, number>(); // `${fy}:${type}` → days used from the allowance
  const out: LeaveDay[] = days.map((d) => {
    if (d.type === 'UNPAID') return { ...d, paid: 0, unpaid: d.amount };
    const key = `${fyOf(d.date)}:${d.type}`;
    const builtUp = perMonth[d.type] * monthsIntoFy(d.date);
    const available = Math.max(0, builtUp - (used.get(key) ?? 0));
    const paid = Math.min(d.amount, available);
    used.set(key, (used.get(key) ?? 0) + paid);
    return { ...d, paid, unpaid: d.amount - paid };
  });

  const fy = fyOf(asOf);
  const balance = { PAID: 0, CASUAL: 0 };
  for (const t of ['PAID', 'CASUAL'] as const) {
    const usedUpTo = out
      .filter((d) => d.type === t && d.date <= asOf && fyOf(d.date) === fy)
      .reduce((sum, d) => sum + d.paid, 0);
    balance[t] = Math.max(0, perMonth[t] * monthsIntoFy(asOf) - usedUpTo);
  }
  return { days: out, balance };
}
